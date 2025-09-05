// --- ROUTAGE INLINE (Netlify lit ça même si le netlify.toml est ignoré)
export const config = {
  path: ["/adherents", "/adherents/", "/adherents/index.html", "/adherents/*"]
};

// --- GUARDE (sans dépendances externes) ---
const COOKIE = Deno.env.get('SESSION_COOKIE_NAME') || 'pm_session';
const DOMAIN = Deno.env.get('AUTH0_DOMAIN');
const ISSUER = `https://${DOMAIN}/`;

let JWKS_CACHE = null, JWKS_TIME = 0;
async function getJWKS() {
  const now = Date.now();
  if (JWKS_CACHE && (now - JWKS_TIME) < 5 * 60 * 1000) return JWKS_CACHE;
  const res = await fetch(`https://${DOMAIN}/.well-known/jwks.json`);
  if (!res.ok) throw new Error('Failed to fetch JWKS');
  JWKS_CACHE = await res.json(); JWKS_TIME = now; return JWKS_CACHE;
}
function b64urlToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = b64.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(base64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function importJwk(jwk) {
  return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['verify']);
}
async function verifyJWT(token) {
  const [h, p, s] = token.split('.');
  if (!s) throw new Error('Bad token');
  const header = JSON.parse(new TextDecoder().decode(b64urlToUint8(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToUint8(p)));
  if (header.alg !== 'RS256') throw new Error('Unsupported alg');
  if (payload.iss !== ISSUER) throw new Error('Bad issuer');
  if (payload.exp && Date.now()/1000 > payload.exp) throw new Error('Expired');
  const jwks = await getJWKS();
  const jwk = jwks.keys.find(k => k.kid === header.kid && k.kty === 'RSA');
  const key = await importJwk(jwk);
  const valid = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, b64urlToUint8(s), new TextEncoder().encode(`${h}.${p}`));
  if (!valid) throw new Error('Bad signature');
  return payload;
}
function readCookie(header, name) {
  if (!header) return null;
  const m = header.match(new RegExp(`${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export default async (request, context) => {
  // log visible dans "Deploys → Edge Functions log"
  console.log("auth-guard hit", request.url);

  const url = new URL(request.url);
  const requireLogin = new Response(null, {
    status: 302,
    headers: { Location: `/login?returnTo=${encodeURIComponent(url.pathname)}` }
  });

  try {
    const token = readCookie(request.headers.get('cookie') || '', COOKIE);
    if (!token) return requireLogin;
    await verifyJWT(token);
    return context.next(); // ok, on laisse passer
  } catch {
    return requireLogin;
  }
};
