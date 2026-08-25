const jwt = require('jsonwebtoken');
const config = require('../config/env');

function signAccessToken({ userId, profileId, role = 'USER', name = '', username = '', mustResetPassword = false, impersonatedBy = null }) {
  return jwt.sign(
    {
      sub: userId,
      profile_id: profileId,
      role,
      name,
      username,
      must_reset_password: Boolean(mustResetPassword),
      impersonated_by: impersonatedBy
    },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiresIn }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.accessSecret);
}

module.exports = { signAccessToken, verifyAccessToken };