const jwt = require('jsonwebtoken');
const config = require('../config/env');

function signAccessToken({ userId, profileId }) {
  return jwt.sign(
    { sub: userId, profile_id: profileId },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiresIn }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.accessSecret);
}

module.exports = { signAccessToken, verifyAccessToken };