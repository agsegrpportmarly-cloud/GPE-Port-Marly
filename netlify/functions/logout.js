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

exports.handler = async () => {
  const name = process.env.SESSION_COOKIE_NAME || 'pm_session';
  const clear = cookie(name, '', 0);
  return { statusCode: 302, headers: { 'Set-Cookie': clear, Location: '/' } };
};
