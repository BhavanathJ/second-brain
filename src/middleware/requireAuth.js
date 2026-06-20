const { verifyAccessToken } = require('../utils/jwt');

// Protects routes by requiring a valid access token in the Authorization
// header: "Authorization: Bearer <token>". On success, attaches
// req.userId and req.profileId — every controller downstream reads
// profile_id from HERE, never from req.body or req.query. This is what
// makes the multi-profile isolation boundary actually enforced, not just
// designed on paper.
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
    // Covers both expired tokens and tampered/invalid signatures.
    // Client's response to this should be: call /refresh, then retry.
    return res.status(401).json({ error: 'Invalid or expired access token.' });
  }
}

module.exports = { requireAuth };
