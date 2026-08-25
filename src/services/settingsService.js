const db = require('../config/db');

async function getSettings(profileId) {
    const stmt = db.prepare('SELECT * FROM settings WHERE profile_id = ?');
    return stmt.get(profileId) || null;
}

async function updateSettings(profileId, fields) {
    const current = await getSettings(profileId);
    if (!current) throw new Error('Settings not found');

    const timezone = fields.timezone !== undefined ? fields.timezone : current.timezone;
    const theme = fields.theme !== undefined ? fields.theme : current.theme;
    const weekStartsOn = fields.week_starts_on !== undefined ? fields.week_starts_on : current.week_starts_on;

    const stmt = db.prepare(`
        UPDATE settings
        SET timezone = ?, theme = ?, week_starts_on = ?, updated_at = datetime('now')
        WHERE profile_id = ?
    `);
    stmt.run(timezone, theme, weekStartsOn, profileId);

    return getSettings(profileId);
}

async function createDefaultSettings(profileId) {
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO settings (profile_id, timezone, theme, week_starts_on, updated_at)
        VALUES (?, 'Asia/Kolkata', 'light', 0, datetime('now'))
    `);
    stmt.run(profileId);
    return getSettings(profileId);
}

module.exports = { getSettings, updateSettings, createDefaultSettings };