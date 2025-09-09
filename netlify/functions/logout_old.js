// netlify/functions/logout.js
function cookie(name, value, maxAge = 0) {
  const parts = [
    `${name}=${value}`,
    'HttpOnly',
    process.env.SESSION_COOKIE_SECURE === 'false' ? '' : 'Secure',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ].filter(Boolean);
  return parts.join('; ');
}

exports.handler = async (event) => {
  const name = process.env.SESSION_COOKIE_NAME || 'pm_session';
  const clear = cookie(name, '', 0);

  const clean = s => (s || '').trim();
  const domain = clean(process.env.AUTH0_DOMAIN).replace(/^https?:\/\//,'').replace(/\/+$/,'');
  const clientId = clean(process.env.AUTH0_CLIENT_ID);

  // IMPORTANT : utiliser une URL autorisée dans Allowed Logout URLs
  const returnTo = `https://${event.headers.host}/`;

  // Si tu ne veux PAS déconnecter chez Auth0, commente la ligne Location ci-dessous
  const auth0Logout = `https://${domain}/v2/logout?client_id=${encodeURIComponent(clientId)}&returnTo=${encodeURIComponent(returnTo)}`;

  return {
    statusCode: 302,
    headers: {
      'Set-Cookie': clear,
      // Redirige vers la page d’accueil après logout Auth0
      Location: auth0Logout
      // Variante "local only" (sans toucher à la session Auth0) :
      // Location: returnTo
    }
  };
};