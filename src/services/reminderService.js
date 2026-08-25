const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

async function listReminders(profileId, { isDone } = {}) {
    let sql = 'SELECT * FROM reminders WHERE profile_id = ? AND deleted_at IS NULL';
    const params = [profileId];

    if (isDone !== undefined) {
        sql += ' AND is_done = ?';
        params.push(isDone ? 1 : 0);
    }

    sql += ' ORDER BY remind_at ASC';
    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    return rows.map(r => ({ ...r, is_done: Boolean(r.is_done) }));
}

async function getReminderById(profileId, reminderId) {
    const stmt = db.prepare('SELECT * FROM reminders WHERE profile_id = ? AND id = ? AND deleted_at IS NULL');
    const r = stmt.get(profileId, reminderId);
    if (!r) return null;
    return { ...r, is_done: Boolean(r.is_done) };
}

async function createReminder(profileId, { title, remind_at, entity_type, entity_id }) {
    const id = uuidv4();
    const stmt = db.prepare(`
        INSERT INTO reminders (id, profile_id, title, remind_at, entity_type, entity_id, is_done, deleted_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, NULL, datetime('now'))
    `);
    stmt.run(id, profileId, title, remind_at, entity_type ?? null, entity_id ?? null);
    return getReminderById(profileId, id);
}

async function updateReminder(profileId, reminderId, fields) {
    const current = await getReminderById(profileId, reminderId);
    if (!current) return null;

    const title = fields.title !== undefined ? fields.title : current.title;
    const remind_at = fields.remind_at !== undefined ? fields.remind_at : current.remind_at;
    const entity_type = fields.entity_type !== undefined ? fields.entity_type : current.entity_type;
    const entity_id = fields.entity_id !== undefined ? fields.entity_id : current.entity_id;
    const is_done = fields.is_done !== undefined ? (fields.is_done ? 1 : 0) : (current.is_done ? 1 : 0);

    const stmt = db.prepare(`
        UPDATE reminders
        SET title = ?, remind_at = ?, entity_type = ?, entity_id = ?, is_done = ?
        WHERE profile_id = ? AND id = ? AND deleted_at IS NULL
    `);
    stmt.run(title, remind_at, entity_type, entity_id, is_done, profileId, reminderId);

    return getReminderById(profileId, reminderId);
}

async function softDeleteReminder(profileId, reminderId) {
    const stmt = db.prepare(`
        UPDATE reminders
        SET deleted_at = datetime('now')
        WHERE profile_id = ? AND id = ? AND deleted_at IS NULL
    `);
    stmt.run(profileId, reminderId);
    return { id: reminderId };
}

async function restoreReminder(profileId, reminderId) {
    const stmt = db.prepare(`
        UPDATE reminders
        SET deleted_at = NULL
        WHERE profile_id = ? AND id = ?
    `);
    stmt.run(profileId, reminderId);
    return getReminderById(profileId, reminderId);
}

async function hardDeleteReminder(profileId, reminderId) {
    const stmt = db.prepare('DELETE FROM reminders WHERE profile_id = ? AND id = ?');
    stmt.run(profileId, reminderId);
}

async function fireReminders() {
    const nowISO = new Date().toISOString();
    const selectStmt = db.prepare(`
        SELECT * FROM reminders
        WHERE is_done = 0 AND deleted_at IS NULL AND remind_at <= ?
    `);
    const dueReminders = selectStmt.all(nowISO);

    if (dueReminders.length > 0) {
        const updateStmt = db.prepare(`
            UPDATE reminders
            SET is_done = 1
            WHERE is_done = 0 AND deleted_at IS NULL AND remind_at <= ?
        `);
        updateStmt.run(nowISO);
        console.log(`[cron] Fired ${dueReminders.length} reminder(s):`, dueReminders.map(r => r.title));
    }

    return dueReminders;
}

module.exports = {
    listReminders,
    getReminderById,
    createReminder,
    updateReminder,
    softDeleteReminder,
    restoreReminder,
    hardDeleteReminder,
    fireReminders,
};