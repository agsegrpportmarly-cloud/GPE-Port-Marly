const COOKIE = Deno.env.get('SESSION_COOKIE_NAME') || 'pm_session';
const DOMAIN = Deno.env.get('AUTH0_DOMAIN');
const ISSUER = `https://${DOMAIN}/`;

let JWKS_CACHE = null;
let JWKS_TIME = 0;

async function getJWKS() {
  const now = Date.now();
  if (JWKS_CACHE && (now - JWKS_TIME) < 5 * 60 * 1000) return JWKS_CACHE;
  const res = await fetch(`https://${DOMAIN}/.well-known/jwks.json`);
  if (!res.ok) throw new Error('Failed to fetch JWKS');
  JWKS_CACHE = await res.json();
  JWKS_TIME = now;
  return JWKS_CACHE;
}

function b64urlToUint8(b64url) {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const base64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importJwk(jwk) {
  return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['verify']);
}

async function verifyJWT(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Bad token');
  const [h, p, s] = parts;
  const header = JSON.parse(new TextDecoder().decode(b64urlToUint8(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToUint8(p)));
  const signature = b64urlToUint8(s);
  if (header.alg !== 'RS256') throw new Error('Unsupported alg');
  if (payload.iss !== ISSUER) throw new Error('Bad issuer');
  if (payload.exp && Date.now()/1000 > payload.exp) throw new Error('Expired');
  const jwks = await getJWKS();
  const jwk = jwks.keys.find(k => k.kid === header.kid && k.kty === 'RSA');
  if (!jwk) throw new Error('No JWK for kid');
  const key = await importJwk(jwk);
  const data = new TextEncoder().encode(`${h}.${p}`);
  const ok = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, signature, data);
  if (!ok) throw new Error('Bad signature');
  return payload;
}

function parseCookie(header, name) {
  if (!header) return null;
  const m = header.match(new RegExp(`${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export default async (request, context) => {
  const url = new URL(request.url);
  const toLogin = new Response(null, {
    status: 302,
    headers: { Location: `/login?returnTo=${encodeURIComponent(url.pathname)}` }
  });
  try {
    const token = parseCookie(request.headers.get('cookie') || '', COOKIE);
    if (!token) return toLogin;
    await verifyJWT(token);
    return context.next();
  } catch {
    return toLogin;
  }
};