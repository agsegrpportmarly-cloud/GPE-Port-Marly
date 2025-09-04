exports.handler = async (event) => {
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_CLIENT_ID;
  const redirectUri = encodeURIComponent(process.env.AUTH0_REDIRECT_URI);
  const state = encodeURIComponent(event.queryStringParameters?.returnTo || "/adherents/");
  const url =
    `https://${domain}/authorize?response_type=code&client_id=${clientId}` +
    `&redirect_uri=${redirectUri}&scope=openid%20profile%20email&state=${state}`;
  return { statusCode: 302, headers: { Location: url } };
};
