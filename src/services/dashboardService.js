const supabase = require('../config/supabase');
const { getLocalDayBounds, getLocalRangeBounds, getLocalDateString } = require('../utils/profileTime');

// All date/time bounds are computed in the profile's local timezone
// (via profileTime.js), not UTC. "Today" means the profile's local
// calendar day.

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

async function getOverdueTasks(profileId, todayStartISO) {
    const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('profile_id', profileId)
        .is('deleted_at', null)
        .eq('status', 'pending')
        .lt('due_at', todayStartISO) // due_at is before the profile's local "today"
        .order('due_at', { ascending: true });

    if (error) throw error;
    return data;
}

// Returns all active habits with today's completion status attached.
// Two queries: fetch habits, fetch today's logs, merge in JS.
async function getHabitsWithTodayStatus(profileId, timeZone) {
    const today = getLocalDateString(timeZone); // 'YYYY-MM-DD' - matches habit_logs.log_date

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

    const completedToday = new Set(logsResult.data.map((l) => l.habit_id));

    return habitsResult.data.map((habit) => ({
        ...habit,
        completed_today: completedToday.has(habit.id),
        today_date: today, // the exact local date string used for this check - frontend uses this for un-marking, never computes its own
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
// timeZone comes from the profile's settings - caller (controller)
// fetches it once and passes it in here.
async function getDashboardData(profileId, timeZone) {
    const today = getLocalDayBounds(timeZone, 0);
    const tomorrow = getLocalDayBounds(timeZone, 1);
    const next7 = getLocalRangeBounds(timeZone, 7);

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
        getHabitsWithTodayStatus(profileId, timeZone),
        getTasksForRange(profileId, tomorrow.start, tomorrow.end),
        getRemindersForRange(profileId, tomorrow.start, tomorrow.end),
        getCalendarEventsForRange(profileId, tomorrow.start, tomorrow.end),
        getTasksForRange(profileId, next7.start, next7.end),
        getRemindersForRange(profileId, next7.start, next7.end),
        getCalendarEventsForRange(profileId, next7.start, next7.end),
        getOverdueTasks(profileId, today.start),
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