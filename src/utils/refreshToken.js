const crypto = require('crypto');

// Generates a long random string — this is what goes to the client.
// Never stored anywhere as-is; only its hash lives in the DB.
function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

// One-way hash for storing in refresh_tokens.token_hash.
// SHA-256 is fine here (unlike passwords, refresh tokens are already
// high-entropy random strings — no need for bcrypt's slow, salted hashing).
function hashRefreshToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

module.exports = { generateRefreshToken, hashRefreshToken };
