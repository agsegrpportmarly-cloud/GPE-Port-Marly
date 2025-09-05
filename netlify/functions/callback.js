function cookie(name, value) {
  const parts = [`${name}=${value}`,'HttpOnly',process.env.SESSION_COOKIE_SECURE==='false'?'':'Secure','Path=/','SameSite=Lax',`Max-Age=${60*60*24}`].filter(Boolean);
  return parts.join('; ');
}
exports.handler = async (event) => {
  try {
    const url = new URL(event.rawUrl || `https://dummy.local/?${event.rawQuery || ''}`);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state') || '/adherents/';
    if (!code) return { statusCode: 400, body: 'Missing authorization code' };
    const clean = s => (s || '').trim();
    const domain = clean(process.env.AUTH0_DOMAIN).replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const clientId = clean(process.env.AUTH0_CLIENT_ID);
    const clientSecret = clean(process.env.AUTH0_CLIENT_SECRET);
    const redirectUri = clean(process.env.AUTH0_REDIRECT_URI);
    if (!domain || !clientId || !clientSecret || !redirectUri) return { statusCode: 500, body: 'Missing Auth0 env config' };
    const tokenRes = await fetch(`https://${domain}/oauth/token`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ grant_type:'authorization_code', client_id:clientId, client_secret:clientSecret, code, redirect_uri:redirectUri }) });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) return { statusCode: tokenRes.status, body: `Token error: ${JSON.stringify(tokenJson)}` };
    const idToken = tokenJson.id_token;
    if (!idToken) return { statusCode: 500, body: 'No id_token in response' };
    const cookieName = process.env.SESSION_COOKIE_NAME || 'pm_session';
    const setCookie = cookie(cookieName, idToken);
    return { statusCode: 302, headers: { 'Set-Cookie': setCookie, Location: state } };
  } catch (e) {
    return { statusCode: 500, body: `Auth callback error: ${e.message}` };
  }
};