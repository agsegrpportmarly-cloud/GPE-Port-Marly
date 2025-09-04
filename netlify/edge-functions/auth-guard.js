import { jwtVerify, createRemoteJWKSet } from 'jose';

const COOKIE = Deno.env.get('SESSION_COOKIE_NAME') || 'pm_session';
const DOMAIN = Deno.env.get('AUTH0_DOMAIN');
const JWKS = createRemoteJWKSet(new URL(`https://${DOMAIN}/.well-known/jwks.json`));

// Chemin -> rôle requis
const RULES = [
  { prefix: '/adherents/clairiere 2PM/', role: 'C2PM' },
  { prefix: '/adherents/clairiere 4PM/', role: 'C4PM' },
  { prefix: '/adherents/meute 1PM/',     role: 'M1PM' },
  { prefix: '/adherents/compagnie 2PM/', role: 'CI2PM' },
  { prefix: '/adherents/troupe 1PM/',    role: 'T1PM' },
  { prefix: '/adherents/meute 3PM/',     role: 'M3PM' },
  { prefix: '/adherents/compagnie 4PM/', role: 'CI4PM' },
  { prefix: '/adherents/troupe 3PM/',    role: 'T3PM' },  
  { prefix: '/adherents/feu/',       role: 'FDNJ' },
  { prefix: '/adherents/clan/',      role: 'CSG' },
];

export default async (request, context) => {
  const url = new URL(request.url);
  const cookies = request.headers.get('cookie') || '';
  const token = (cookies.match(new RegExp(`${COOKIE}=([^;]+)`)) || [])[1];

  // Redirection vers /login si pas connecté
  const toLogin = new Response(null, {
    status: 302,
    headers: { Location: `/login?returnTo=${encodeURIComponent(url.pathname)}` }
  });

  if (!token) return toLogin;

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://${DOMAIN}/`
    });

    // ⚠️ garde exactement ce namespace, identique à ton Action Auth0
    const roles = payload['https://pmarly/roles'] || [];
    const isAdmin = roles.includes('admin');

    // Cherche si la route demandée exige un rôle précis
    const rule = RULES.find(r => url.pathname.startsWith(r.prefix));
    if (!rule) return context.next(); // juste connecté suffit pour /adherents/* sans sous-règle

    if (isAdmin || roles.includes(rule.role)) return context.next();

    return new Response('Accès refusé', { status: 401, headers: {'content-type':'text/plain; charset=utf-8'} });
  } catch {
    // Token expiré/invalide -> relogin
    return toLogin;
  }
};