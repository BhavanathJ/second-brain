const { verifyAccessToken } = require('../utils/jwt');

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.profileId = payload.profile_id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired access token.' });
  }
}

module.exports = { requireAuth };