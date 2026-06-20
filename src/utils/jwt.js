const jwt = require('jsonwebtoken');
const config = require('../config/env');

// Access token carries BOTH user_id and active_profile_id — this is the
// hard isolation boundary decided early on. Every protected route reads
// profile_id from here, never trusts a profile_id sent in the request body.
function signAccessToken({ userId, profileId }) {
  return jwt.sign(
    { sub: userId, profile_id: profileId },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiresIn }
  );
}

// Throws if the token is invalid or expired — caller (middleware) decides
// what to do with that (typically respond 401).
function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.accessSecret);
}

module.exports = { signAccessToken, verifyAccessToken };
