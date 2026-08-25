const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

async function listCalendarEvents(profileId, { start, end } = {}) {
    let sql = 'SELECT * FROM calendar_events WHERE profile_id = ? AND deleted_at IS NULL';
    const params = [profileId];

    if (start) {
        sql += ' AND starts_at >= ?';
        params.push(start);
    }
    if (end) {
        sql += ' AND starts_at <= ?';
        params.push(end);
    }

    sql += ' ORDER BY starts_at ASC';
    const stmt = db.prepare(sql);
    return stmt.all(...params);
}

async function getCalendarEventById(profileId, eventId) {
    const stmt = db.prepare('SELECT * FROM calendar_events WHERE profile_id = ? AND id = ? AND deleted_at IS NULL');
    return stmt.get(profileId, eventId) || null;
}

async function createCalendarEvent(profileId, { title, starts_at, ends_at, location }) {
    const id = uuidv4();
    const stmt = db.prepare(`
        INSERT INTO calendar_events (id, profile_id, title, starts_at, ends_at, location, deleted_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL, datetime('now'))
    `);
    stmt.run(id, profileId, title, starts_at, ends_at ?? null, location ?? null);
    return getCalendarEventById(profileId, id);
}

async function updateCalendarEvent(profileId, eventId, fields) {
    const current = await getCalendarEventById(profileId, eventId);
    if (!current) return null;

    const title = fields.title !== undefined ? fields.title : current.title;
    const starts_at = fields.starts_at !== undefined ? fields.starts_at : current.starts_at;
    const ends_at = fields.ends_at !== undefined ? fields.ends_at : current.ends_at;
    const location = fields.location !== undefined ? fields.location : current.location;

    const stmt = db.prepare(`
        UPDATE calendar_events
        SET title = ?, starts_at = ?, ends_at = ?, location = ?
        WHERE profile_id = ? AND id = ? AND deleted_at IS NULL
    `);
    stmt.run(title, starts_at, ends_at, location, profileId, eventId);

    return getCalendarEventById(profileId, eventId);
}

async function softDeleteCalendarEvent(profileId, eventId) {
    const stmt = db.prepare(`
        UPDATE calendar_events
        SET deleted_at = datetime('now')
        WHERE profile_id = ? AND id = ? AND deleted_at IS NULL
    `);
    stmt.run(profileId, eventId);
    return { id: eventId };
}

async function restoreCalendarEvent(profileId, eventId) {
    const stmt = db.prepare(`
        UPDATE calendar_events
        SET deleted_at = NULL
        WHERE profile_id = ? AND id = ?
    `);
    stmt.run(profileId, eventId);
    return getCalendarEventById(profileId, eventId);
}

async function hardDeleteCalendarEvent(profileId, eventId) {
    const stmt = db.prepare('DELETE FROM calendar_events WHERE profile_id = ? AND id = ?');
    stmt.run(profileId, eventId);
}

async function getEventsForRange(profileId, startDate, endDate) {
    const stmt = db.prepare(`
        SELECT * FROM calendar_events
        WHERE profile_id = ? AND deleted_at IS NULL AND starts_at >= ? AND starts_at <= ?
        ORDER BY starts_at ASC
    `);
    return stmt.all(profileId, startDate, endDate);
}

module.exports = {
    listCalendarEvents,
    getCalendarEventById,
    createCalendarEvent,
    updateCalendarEvent,
    softDeleteCalendarEvent,
    restoreCalendarEvent,
    hardDeleteCalendarEvent,
    getEventsForRange,
};