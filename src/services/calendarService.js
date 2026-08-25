const db = require('../config/db');
const calendarEventService = require('./calendarEventService');

async function getTasksForRange(profileId, startDate, endDate) {
    const stmt = db.prepare(`
        SELECT * FROM tasks
        WHERE profile_id = ? AND deleted_at IS NULL AND due_at >= ? AND due_at <= ?
        ORDER BY due_at ASC
    `);
    const rows = stmt.all(profileId, startDate, endDate);
    return rows.map(r => ({
        ...r,
        urgent: Boolean(r.urgent),
        important: Boolean(r.important),
    }));
}

async function getHabitLogsForRange(profileId, startDate, endDate) {
    const stmt = db.prepare(`
        SELECT hl.*, h.id as habit_id, h.title as habit_title, h.target_per_week as habit_target_per_week
        FROM habit_logs hl
        JOIN habits h ON hl.habit_id = h.id
        WHERE hl.profile_id = ? AND hl.completed = 1 AND hl.log_date >= ? AND hl.log_date <= ?
        ORDER BY hl.log_date ASC
    `);
    const rows = stmt.all(profileId, startDate, endDate);
    return rows.map(r => ({
        id: r.id,
        habit_id: r.habit_id,
        profile_id: r.profile_id,
        log_date: r.log_date,
        completed: Boolean(r.completed),
        created_at: r.created_at,
        habits: {
            id: r.habit_id,
            title: r.habit_title,
            target_per_week: r.habit_target_per_week,
        }
    }));
}

async function getRemindersForRange(profileId, startDate, endDate) {
    const stmt = db.prepare(`
        SELECT * FROM reminders
        WHERE profile_id = ? AND deleted_at IS NULL AND remind_at >= ? AND remind_at <= ?
        ORDER BY remind_at ASC
    `);
    const rows = stmt.all(profileId, startDate, endDate);
    return rows.map(r => ({
        ...r,
        is_done: Boolean(r.is_done)
    }));
}

async function getCalendarData(profileId, startDate, endDate) {
    const tasks = await getTasksForRange(profileId, startDate, endDate);
    const habitLogs = await getHabitLogsForRange(profileId, startDate, endDate);
    const calendarEvents = await calendarEventService.getEventsForRange(profileId, startDate, endDate);
    const reminders = await getRemindersForRange(profileId, startDate, endDate);

    return { tasks, habitLogs, calendarEvents, reminders };
}

module.exports = { getCalendarData };