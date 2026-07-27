const supabase = require('../config/supabase');

// All date comparisons use UTC. Frontend formats dates for display
// in the user's local timezone — backend stays UTC throughout.

function getTodayBounds() {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date();
    end.setUTCHours(23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
}

function getTomorrowBounds() {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 1);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCHours(23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
}

function getNext7DaysBounds() {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date();
    end.setUTCDate(end.getUTCDate() + 7);
    end.setUTCHours(23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
}

// --- Individual queries ---

async function getTasksForRange(profileId, start, end) {
    const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('profile_id', profileId)
        .is('deleted_at', null)
        .gte('due_at', start)
        .lte('due_at', end)
        .order('due_at', { ascending: true });

    if (error) throw error;
    return data;
}

async function getOverdueTasks(profileId) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('profile_id', profileId)
        .is('deleted_at', null)
        .eq('status', 'pending')
        .lt('due_at', today.toISOString()) // due_at is before today
        .order('due_at', { ascending: true });

    if (error) throw error;
    return data;
}

// Returns all active habits with today's completion status attached.
// Two queries: fetch habits, fetch today's logs, merge in JS.
// Avoids a complex SQL join while keeping the response shape clean.
async function getHabitsWithTodayStatus(profileId) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const [habitsResult, logsResult] = await Promise.all([
        supabase
            .from('habits')
            .select('*')
            .eq('profile_id', profileId)
            .is('deleted_at', null)
            .order('created_at', { ascending: true }),
        supabase
            .from('habit_logs')
            .select('habit_id')
            .eq('profile_id', profileId)
            .eq('log_date', today)
            .eq('completed', true),
    ]);

    if (habitsResult.error) throw habitsResult.error;
    if (logsResult.error) throw logsResult.error;

    // Build a Set of habit_ids completed today for O(1) lookup.
    const completedToday = new Set(logsResult.data.map((l) => l.habit_id));

    return habitsResult.data.map((habit) => ({
        ...habit,
        completed_today: completedToday.has(habit.id),
    }));
}

async function getRemindersForRange(profileId, start, end) {
    const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('profile_id', profileId)
        .is('deleted_at', null)
        .eq('is_done', false)
        .gte('remind_at', start)
        .lte('remind_at', end)
        .order('remind_at', { ascending: true });

    if (error) throw error;
    return data;
}

async function getCalendarEventsForRange(profileId, start, end) {
    const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('profile_id', profileId)
        .is('deleted_at', null)
        .gte('starts_at', start)
        .lte('starts_at', end)
        .order('starts_at', { ascending: true });

    if (error) throw error;
    return data;
}

// --- Main aggregation ---
// Runs all queries in parallel using Promise.all.
// Total response time = slowest single query, not the sum of all queries.
async function getDashboardData(profileId) {
    const today = getTodayBounds();
    const tomorrow = getTomorrowBounds();
    const next7 = getNext7DaysBounds();

    const [
        todayTasks,
        todayReminders,
        todayEvents,
        todayHabits,
        tomorrowTasks,
        tomorrowReminders,
        tomorrowEvents,
        next7Tasks,
        next7Reminders,
        next7Events,
        overdueTasks,
    ] = await Promise.all([
        getTasksForRange(profileId, today.start, today.end),
        getRemindersForRange(profileId, today.start, today.end),
        getCalendarEventsForRange(profileId, today.start, today.end),
        getHabitsWithTodayStatus(profileId),
        getTasksForRange(profileId, tomorrow.start, tomorrow.end),
        getRemindersForRange(profileId, tomorrow.start, tomorrow.end),
        getCalendarEventsForRange(profileId, tomorrow.start, tomorrow.end),
        getTasksForRange(profileId, next7.start, next7.end),
        getRemindersForRange(profileId, next7.start, next7.end),
        getCalendarEventsForRange(profileId, next7.start, next7.end),
        getOverdueTasks(profileId),
    ]);

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