const supabase = require('../config/supabase');

// Get a single log entry for a habit on a specific date.
async function getLogForDate(habitId, profileId, date) {
    const { data, error } = await supabase
        .from('habit_logs')
        .select('*')
        .eq('habit_id', habitId)
        .eq('profile_id', profileId)
        .eq('log_date', date)
        .maybeSingle();

    if (error) throw error;
    return data;
}

// Mark a habit as completed for a specific date.
// UNIQUE(habit_id, log_date) constraint in DB prevents double-logging —
// Supabase will throw a 23505 error if this date already has a log,
// which the controller catches and returns as a clean 409.
async function createLog(habitId, profileId, date) {
    const { data, error } = await supabase
        .from('habit_logs')
        .insert({
            habit_id: habitId,
            profile_id: profileId,
            log_date: date,
            completed: true,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

// Unmark a habit completion for a specific date.
async function deleteLog(habitId, profileId, date) {
    const { data, error } = await supabase
        .from('habit_logs')
        .delete()
        .eq('habit_id', habitId)
        .eq('profile_id', profileId)
        .eq('log_date', date)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data; // null if no log existed for that date
}

// Get all logs for a habit within a date range.
// Used by Calendar to render habit completion dots on specific days.
async function getLogsForRange(habitId, profileId, startDate, endDate) {
    const { data, error } = await supabase
        .from('habit_logs')
        .select('*')
        .eq('habit_id', habitId)
        .eq('profile_id', profileId)
        .gte('log_date', startDate)
        .lte('log_date', endDate)
        .order('log_date', { ascending: true });

    if (error) throw error;
    return data;
}

module.exports = { getLogForDate, createLog, deleteLog, getLogsForRange };