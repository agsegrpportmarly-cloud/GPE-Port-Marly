function cookie(name, value) {
  const parts = [
    `${name}=${value}`,
    'HttpOnly',
    process.env.SESSION_COOKIE_SECURE === 'false' ? '' : 'Secure',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${60*60*24}` // 1 jour
  ].filter(Boolean);
  return parts.join('; ');
}

exports.handler = async (event) => {
  try {
    const params = new URLSearchParams(event.rawQuery || '');
    const code = params.get('code');
    const state = params.get('state') || '/adherents/';
    if (!code) throw new Error('Missing code');

    const res = await fetch(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.AUTH0_CLIENT_ID,
        client_secret: process.env.AUTH0_CLIENT_SECRET,
        code,
        redirect_uri: process.env.AUTH0_REDIRECT_URI
      })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(json));

    const idToken = json.id_token;
    if (!idToken) throw new Error('No id_token');

    const setCookie = cookie(process.env.SESSION_COOKIE_NAME || 'pm_session', idToken);

    return { statusCode: 302, headers: { 'Set-Cookie': setCookie, Location: state } };
  } catch (e) {
    return { statusCode: 500, body: `Auth callback error: ${e.message}` };
  }
};
