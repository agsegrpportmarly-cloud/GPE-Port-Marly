exports.handler = async (event) => {
  const clean = s => (s || '').trim();
  const domain = clean(process.env.AUTH0_DOMAIN).replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const clientId = clean(process.env.AUTH0_CLIENT_ID);
  const redirectUriRaw = clean(process.env.AUTH0_REDIRECT_URI) || `https://${event.headers.host}/.netlify/functions/callback`;
  const redirectUri = encodeURIComponent(redirectUriRaw);
  const state = encodeURIComponent(event.queryStringParameters?.returnTo || "/adherents/");
  if (!domain || !clientId || !redirectUriRaw) {
    return { statusCode: 500, body: `Missing config. domain=${domain}, clientId set=${!!clientId}, redirectUri=${redirectUriRaw}` };
  }
  const url = `https://${domain}/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=openid%20profile%20email&state=${state}`;
  return { statusCode: 302, headers: { Location: url } };
};