// Edge Function to protect /adherents/* without external dependencies
const COOKIE = Deno.env.get('SESSION_COOKIE_NAME') || 'pm_session';
const DOMAIN = Deno.env.get('AUTH0_DOMAIN');
const ISSUER = `https://${DOMAIN}/`;

const RULES = [
  { prefix: '/adherents/clairiere 2PM/', role: 'C2PM' },
  { prefix: '/adherents/clairiere 4PM/', role: 'C4PM' },
  { prefix: '/adherents/meute 1PM/',     role: 'M1PM' },
  { prefix: '/adherents/compagnie 2PM/', role: 'CI2PM' },
  { prefix: '/adherents/troupe 1 PM/',   role: 'T1PM' },
  { prefix: '/adherents/meute 3PM/',     role: 'M3PM' },
  { prefix: '/adherents/compagnie 4PM/', role: 'CI4PM' },
  { prefix: '/adherents/troupe 3 PM/',   role: 'T3PM' },
  { prefix: '/adherents/feu/',           role: 'FDNJ' },
  { prefix: '/adherents/clan/',          role: 'CSG' },
];

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
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    true,
    ['verify']
  );
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

    const payload = await verifyJWT(token);
    const roles = payload['https://pmarly/roles'] || [];
    const isAdmin = roles.includes('admin');

    const rule = RULES.find(r => url.pathname.startsWith(r.prefix));
    if (!rule) return context.next(); // logged-in is enough

    if (isAdmin || roles.includes(rule.role)) return context.next();
    return new Response('Accès refusé', { status: 401, headers: {'content-type':'text/plain; charset=utf-8'} });
  } catch (_e) {
    return toLogin;
  }
};
