const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

async function getLogForDate(habitId, profileId, date) {
    const stmt = db.prepare('SELECT * FROM habit_logs WHERE habit_id = ? AND profile_id = ? AND log_date = ?');
    const r = stmt.get(habitId, profileId, date);
    if (!r) return null;
    return { ...r, completed: Boolean(r.completed) };
}

async function createLog(habitId, profileId, date) {
    const existing = await getLogForDate(habitId, profileId, date);
    if (existing) {
        const err = new Error('Log for this date already exists');
        err.code = '23505';
        throw err;
    }

    const id = uuidv4();
    const stmt = db.prepare(`
        INSERT INTO habit_logs (id, habit_id, profile_id, log_date, completed, created_at)
        VALUES (?, ?, ?, ?, 1, datetime('now'))
    `);
    stmt.run(id, habitId, profileId, date);
    return getLogForDate(habitId, profileId, date);
}

async function deleteLog(habitId, profileId, date) {
    const existing = await getLogForDate(habitId, profileId, date);
    if (!existing) return null;

    const stmt = db.prepare('DELETE FROM habit_logs WHERE habit_id = ? AND profile_id = ? AND log_date = ?');
    stmt.run(habitId, profileId, date);
    return existing;
}

async function getLogsForRange(habitId, profileId, startDate, endDate) {
    const stmt = db.prepare(`
        SELECT * FROM habit_logs
        WHERE habit_id = ? AND profile_id = ? AND log_date >= ? AND log_date <= ?
        ORDER BY log_date ASC
    `);
    const rows = stmt.all(habitId, profileId, startDate, endDate);
    return rows.map(r => ({ ...r, completed: Boolean(r.completed) }));
}

module.exports = { getLogForDate, createLog, deleteLog, getLogsForRange };