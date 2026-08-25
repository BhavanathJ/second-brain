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
    req.userRole = payload.role || 'USER';
    req.user = payload;

    // Strict Enforcement: If user must reset password, block all other API access until reset
    if (payload.must_reset_password) {
      const isPasswordChange = req.baseUrl === '/api/auth' && (req.path === '/password' || req.path === '/logout');
      if (!isPasswordChange) {
        return res.status(403).json({
          error: 'Password reset required. You must change your password before accessing the panel.',
          must_reset_password: true
        });
      }
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired access token.' });
  }
}


function requireAdmin(req, res, next) {
  if (req.userRole !== 'ADMIN') {
    return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };