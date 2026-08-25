const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

async function listProfilesForUser(userId) {
    const stmt = db.prepare('SELECT * FROM profiles WHERE user_id = ? ORDER BY created_at ASC');
    return stmt.all(userId);
}

async function countProfilesForUser(userId) {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM profiles WHERE user_id = ?');
    const res = stmt.get(userId);
    return res ? res.count : 0;
}

async function createProfile(userId, name) {
    const id = uuidv4();
    const stmt = db.prepare(`
        INSERT INTO profiles (id, user_id, name, created_at)
        VALUES (?, ?, ?, datetime('now'))
    `);
    stmt.run(id, userId, name);
    return findProfileForUser(userId, id);
}

async function findProfileForUser(userId, profileId) {
    const stmt = db.prepare('SELECT * FROM profiles WHERE user_id = ? AND id = ?');
    return stmt.get(userId, profileId) || null;
}

module.exports = {
    listProfilesForUser,
    countProfilesForUser,
    createProfile,
    findProfileForUser,
};