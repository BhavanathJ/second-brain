const supabase = require('../config/supabase');
const calendarEventService = require('./calendarEventService');

async function getTasksForRange(profileId, startDate, endDate) {
    const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('profile_id', profileId)
        .is('deleted_at', null)
        .gte('due_at', startDate)
        .lte('due_at', endDate)
        .order('due_at', { ascending: true });

    if (error) throw error;
    return data;
}

// '*, habits(id, title, target_per_week)' is Supabase's foreign key join
// syntax — works because habit_logs.habit_id references habits.id.
// Returns each log with its parent habit nested inside, so the frontend
// knows which habit each log belongs to without a second request.
async function getHabitLogsForRange(profileId, startDate, endDate) {
    const { data, error } = await supabase
        .from('habit_logs')
        .select('*, habits(id, title, target_per_week)')
        .eq('profile_id', profileId)
        .eq('completed', true)
        .gte('log_date', startDate)
        .lte('log_date', endDate)
        .order('log_date', { ascending: true });

    if (error) throw error;
    return data;
}

async function getRemindersForRange(profileId, startDate, endDate) {
    const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('profile_id', profileId)
        .is('deleted_at', null)
        .gte('remind_at', startDate)
        .lte('remind_at', endDate)
        .order('remind_at', { ascending: true });

    if (error) throw error;
    return data;
}

// Runs all four queries in parallel — total wait time is the slowest
// single query, not the sum of all four.
async function getCalendarData(profileId, startDate, endDate) {
    const [tasks, habitLogs, calendarEvents, reminders] = await Promise.all([
        getTasksForRange(profileId, startDate, endDate),
        getHabitLogsForRange(profileId, startDate, endDate),
        calendarEventService.getEventsForRange(profileId, startDate, endDate),
        getRemindersForRange(profileId, startDate, endDate),
    ]);

    return { tasks, habitLogs, calendarEvents, reminders };
}

module.exports = { getCalendarData };