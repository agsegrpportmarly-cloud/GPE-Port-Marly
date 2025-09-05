function cookie(name, value, opts = {}) {
  const { maxAge = 60 * 60 * 24, httpOnly = true } = opts;
  const parts = [
    `${name}=${value}`,
    httpOnly ? 'HttpOnly' : '',
    process.env.SESSION_COOKIE_SECURE === 'false' ? '' : 'Secure',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ].filter(Boolean);
  return parts.join('; ');
}

function decodeJwtPayload(idToken) {
  try {
    const b64 = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(Buffer.from(b64 + pad, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function getRoles(payload) {
  for (const k of ["https://pmarly/roles", "https://portmarly/roles", "roles"]) {
    const v = payload?.[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function pickLanding(roles) {
  if (roles.includes('admin')) return '/adherents/';
  const map = [
    ['C2PM', '/adherents/clairiere 2PM/'],
    ['C4PM', '/adherents/clairiere 4PM/'],
    ['M1PM', '/adherents/meute 1PM/'],
    ['M3PM', '/adherents/meute 3PM/'],
    ['CI2PM','/adherents/compagnie 2PM/'],
    ['CI4PM','/adherents/compagnie 4PM/'],
    ['T1PM', '/adherents/troupe 1 PM/'],
    ['T3PM', '/adherents/troupe 3 PM/'],
    ['FDNJ','/adherents/feu/'],
    ['CSG', '/adherents/clan/'],
  ];
  for (const [role, path] of map) {
    if (roles.includes(role)) return path;
  }
  return '/adherents/';
}

exports.handler = async (event) => {
  try {
    const url = new URL(event.rawUrl || `https://dummy.local/?${event.rawQuery || ''}`);
    const code  = url.searchParams.get('code');
    let state   = url.searchParams.get('state') || '/adherents/';
    if (!code) return { statusCode: 400, body: 'Missing authorization code' };

    const clean = s => (s || '').trim();
    const domain       = clean(process.env.AUTH0_DOMAIN).replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const clientId     = clean(process.env.AUTH0_CLIENT_ID);
    const clientSecret = clean(process.env.AUTH0_CLIENT_SECRET);
    const redirectUri  = clean(process.env.AUTH0_REDIRECT_URI);
    if (!domain || !clientId || !clientSecret || !redirectUri) {
      return { statusCode: 500, body: 'Missing Auth0 env config' };
    }

    const tokenRes = await fetch(`https://${domain}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri
      })
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) return { statusCode: tokenRes.status, body: `Token error: ${JSON.stringify(tokenJson)}` };

    const idToken = tokenJson.id_token;
    if (!idToken) return { statusCode: 500, body: 'No id_token in response' };

    const cookieName = process.env.SESSION_COOKIE_NAME || 'pm_session';
    const setSession = cookie(cookieName, idToken, { httpOnly: true });

    if (state === '/' || state === '/adherents' || state === '/adherents/') {
      const payload = decodeJwtPayload(idToken) || {};
      const roles   = getRoles(payload);
      state = pickLanding(roles);
    }

    return { statusCode: 302, headers: { 'Set-Cookie': setSession, Location: state } };
  } catch (e) {
    return { statusCode: 500, body: `Auth callback error: ${e.message}` };
  }
};