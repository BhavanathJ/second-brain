const db = require('../config/db');
const { getLocalDayBounds, getLocalRangeBounds, getLocalDateString } = require('../utils/profileTime');

function getTasksForRange(profileId, start, end) {
    const stmt = db.prepare(`
        SELECT * FROM tasks
        WHERE profile_id = ? AND deleted_at IS NULL AND due_at >= ? AND due_at <= ?
        ORDER BY due_at ASC
    `);
    const rows = stmt.all(profileId, start, end);
    return rows.map(r => ({
        ...r,
        urgent: Boolean(r.urgent),
        important: Boolean(r.important),
    }));
}

function getOverdueTasks(profileId, todayStartISO) {
    const stmt = db.prepare(`
        SELECT * FROM tasks
        WHERE profile_id = ? AND deleted_at IS NULL AND status = 'pending' AND due_at < ?
        ORDER BY due_at ASC
    `);
    const rows = stmt.all(profileId, todayStartISO);
    return rows.map(r => ({
        ...r,
        urgent: Boolean(r.urgent),
        important: Boolean(r.important),
    }));
}

function getHabitsWithTodayStatus(profileId, timeZone) {
    const today = getLocalDateString(timeZone);

    const habits = db.prepare(`
        SELECT * FROM habits
        WHERE profile_id = ? AND deleted_at IS NULL
        ORDER BY created_at ASC
    `).all(profileId);

    const logs = db.prepare(`
        SELECT habit_id FROM habit_logs
        WHERE profile_id = ? AND log_date = ? AND completed = 1
    `).all(profileId, today);

    const completedToday = new Set(logs.map(l => l.habit_id));

    return habits.map(habit => ({
        ...habit,
        completed_today: completedToday.has(habit.id),
        today_date: today,
    }));
}

function getRemindersForRange(profileId, start, end) {
    const stmt = db.prepare(`
        SELECT * FROM reminders
        WHERE profile_id = ? AND deleted_at IS NULL AND is_done = 0 AND remind_at >= ? AND remind_at <= ?
        ORDER BY remind_at ASC
    `);
    const rows = stmt.all(profileId, start, end);
    return rows.map(r => ({ ...r, is_done: Boolean(r.is_done) }));
}

function getCalendarEventsForRange(profileId, start, end) {
    const stmt = db.prepare(`
        SELECT * FROM calendar_events
        WHERE profile_id = ? AND deleted_at IS NULL AND starts_at >= ? AND starts_at <= ?
        ORDER BY starts_at ASC
    `);
    return stmt.all(profileId, start, end);
}

async function getDashboardData(profileId, timeZone) {
    const today = getLocalDayBounds(timeZone, 0);
    const tomorrow = getLocalDayBounds(timeZone, 1);
    const next7 = getLocalRangeBounds(timeZone, 7);

    const todayTasks = getTasksForRange(profileId, today.start, today.end);
    const todayReminders = getRemindersForRange(profileId, today.start, today.end);
    const todayEvents = getCalendarEventsForRange(profileId, today.start, today.end);
    const todayHabits = getHabitsWithTodayStatus(profileId, timeZone);

    const tomorrowTasks = getTasksForRange(profileId, tomorrow.start, tomorrow.end);
    const tomorrowReminders = getRemindersForRange(profileId, tomorrow.start, tomorrow.end);
    const tomorrowEvents = getCalendarEventsForRange(profileId, tomorrow.start, tomorrow.end);

    const next7Tasks = getTasksForRange(profileId, next7.start, next7.end);
    const next7Reminders = getRemindersForRange(profileId, next7.start, next7.end);
    const next7Events = getCalendarEventsForRange(profileId, next7.start, next7.end);

    const overdueTasks = getOverdueTasks(profileId, today.start);

    return {
        today: {
            tasks: todayTasks,
            habits: todayHabits,
            reminders: todayReminders,
            calendar_events: todayEvents,
        },
        tomorrow: {
            tasks: tomorrowTasks,
            reminders: tomorrowReminders,
            calendar_events: tomorrowEvents,
        },
        next_7_days: {
            tasks: next7Tasks,
            reminders: next7Reminders,
            calendar_events: next7Events,
        },
        overdue: {
            tasks: overdueTasks,
        },
    };
}

module.exports = { getDashboardData };