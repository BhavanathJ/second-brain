const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

async function findUserByEmail(email) {
    if (!email) return null;
    const stmt = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)');
    return stmt.get(email) || null;
}

async function findUserByUsername(username) {
    if (!username) return null;
    const stmt = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)');
    return stmt.get(username) || null;
}

async function findUserById(userId) {
    if (!userId) return null;
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(userId) || null;
}

async function countUsers() {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM users');
    const res = stmt.get();
    return res ? res.count : 0;
}

async function createUser({ name, username, email, passwordHash, role = 'USER', status = 'active', mustResetPassword = 0 }) {
    const id = uuidv4();
    const finalUsername = username ? username.trim().toLowerCase() : (email.split('@')[0] + Math.floor(1000 + Math.random() * 9000));
    const finalName = name ? name.trim() : email.split('@')[0];

    const stmt = db.prepare(`
        INSERT INTO users (id, name, username, email, password_hash, role, status, must_reset_password, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    stmt.run(id, finalName, finalUsername, email.toLowerCase(), passwordHash, role, status, mustResetPassword ? 1 : 0);

    return findUserById(id);
}

async function updatePassword(userId, newPasswordHash) {
    const stmt = db.prepare('UPDATE users SET password_hash = ?, must_reset_password = 0 WHERE id = ?');
    stmt.run(newPasswordHash, userId);
}

async function createDefaultProfile(userId) {
    const id = uuidv4();
    const stmt = db.prepare(`
        INSERT INTO profiles (id, user_id, name, created_at)
        VALUES (?, ?, 'Default', datetime('now'))
    `);
    stmt.run(id, userId);
    return findProfileById(id);
}

async function findProfileById(profileId) {
    if (!profileId) return null;
    const stmt = db.prepare('SELECT * FROM profiles WHERE id = ?');
    return stmt.get(profileId) || null;
}

async function findDefaultProfileForUser(userId) {
    if (!userId) return null;
    const stmt = db.prepare('SELECT * FROM profiles WHERE user_id = ? ORDER BY created_at ASC LIMIT 1');
    return stmt.get(userId) || null;
}

async function storeRefreshToken({ userId, profileId, tokenHash, expiresAt }) {
    const id = uuidv4();
    const stmt = db.prepare(`
        INSERT INTO refresh_tokens (id, user_id, profile_id, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);
    stmt.run(id, userId, profileId, tokenHash, expiresAt);
}

async function findActiveRefreshToken(tokenHash) {
    const stmt = db.prepare(`
        SELECT * FROM refresh_tokens
        WHERE token_hash = ? AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
    `);
    return stmt.get(tokenHash) || null;
}

async function revokeRefreshToken(tokenHash) {
    const stmt = db.prepare(`
        UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE token_hash = ?
    `);
    stmt.run(tokenHash);
}

async function revokeAllRefreshTokensForUser(userId) {
    const stmt = db.prepare(`
        UPDATE refresh_tokens SET revoked_at = datetime('now')
        WHERE user_id = ? AND revoked_at IS NULL
    `);
    stmt.run(userId);
}

module.exports = {
    findUserByEmail,
    findUserByUsername,
    findUserById,
    countUsers,
    createUser,
    updatePassword,
    createDefaultProfile,
    findProfileById,
    findDefaultProfileForUser,
    storeRefreshToken,
    findActiveRefreshToken,
    revokeAllRefreshTokensForUser,
    revokeRefreshToken,
};