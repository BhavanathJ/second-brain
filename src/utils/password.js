const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

// Run at signup — turns a plain password into a hash safe to store in users.password_hash.
async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

// Run at login — compares the typed password against the stored hash.
// Never compare plain text passwords directly, even if you "trust" the DB.
async function comparePassword(plainPassword, hash) {
  return bcrypt.compare(plainPassword, hash);
}

module.exports = { hashPassword, comparePassword };
