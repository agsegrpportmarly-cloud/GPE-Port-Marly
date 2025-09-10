export const config = {
  // ⚠️ Ne cible PLUS la racine /adherents ni /adherents/index.html
  path: ["/adherents/*"]
};

const COOKIE = Deno.env.get('SESSION_COOKIE_NAME') || 'pm_session';
const DOMAIN = Deno.env.get('AUTH0_DOMAIN');
const ISSUER = `https://${DOMAIN}/`;

// Harmonise en minuscules pour éviter les soucis de casse et d'espaces encodés
const RULES = [
  { prefix: "/adherents/clairiere 2pm/", role: "C2PM" },
  { prefix: "/adherents/clairiere 4pm/", role: "C4PM" },
  { prefix: "/adherents/compagnie 2pm/", role: "CI2PM" },
  { prefix: "/adherents/compagnie 4pm/", role: "CI4PM" },
  { prefix: "/adherents/meute 1pm/",     role: "M1PM" },
  { prefix: "/adherents/meute 3pm/",     role: "M3PM" },
  { prefix: "/adherents/troupe 1 pm/",   role: "T1PM" },
  { prefix: "/adherents/troupe 3 pm/",   role: "T3PM" },
  { prefix: "/adherents/feu/",           role: "FDNJ" },
  { prefix: "/adherents/clan/",          role: "CSG" },
  // ❌ PAS de règle pour "/adherents/" : la page racine reste publique
].map(r => ({ prefix: r.prefix.toLowerCase(), role: r.role }));

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
function getRoles(payload) {
  for (const k of ["https://pmarly/roles", "https://portmarly/roles", "roles"]) {
    const v = payload?.[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

export default async (request, context) => {
  const url = new URL(request.url);
  const pathname = decodeURIComponent(url.pathname).toLowerCase();

  // 1) Ne protéger QUE si une règle correspond
  const rule = RULES.find(r => pathname.startsWith(r.prefix));
  if (!rule) {
    // -> racine /adherents/ ou autres chemins non listés : accès public
    return context.next();
  }

  // 2) Pour les chemins protégés : exiger une session
  const token = readCookie(request.headers.get('cookie') || '', COOKIE);
  const redirectToPublic = new Response(null, {
    status: 302,
    headers: { Location: `/adherents/?returnTo=${encodeURIComponent(url.pathname)}` }
  });
  if (!token) return redirectToPublic;

  try {
    const payload = await verifyJWT(token);
    const roles   = getRoles(payload);
    const isAdmin = roles.includes("admin");

    if (isAdmin || roles.includes(rule.role)) return context.next();

    return new Response("Accès refusé (rôle manquant)", {
      status: 401,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  } catch {
    return redirectToPublic;
  }
};
