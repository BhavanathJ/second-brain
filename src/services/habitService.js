const supabase = require('../config/supabase');
const { getLocalWeekStartDateString, addDaysToDateString, getLocalDateString } = require('../utils/profileTime');

// --- HABITS CRUD --- (unchanged from before)

async function listHabits(profileId) {
    const { data, error } = await supabase
        .from('habits')
        .select('*')
        .eq('profile_id', profileId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
}

async function getHabitById(profileId, habitId) {
    const { data, error } = await supabase
        .from('habits')
        .select('*')
        .eq('profile_id', profileId)
        .eq('id', habitId)
        .is('deleted_at', null)
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function createHabit(profileId, { title, targetPerWeek }) {
    const { data, error } = await supabase
        .from('habits')
        .insert({
            profile_id: profileId,
            title,
            target_per_week: targetPerWeek ?? 7, // default: daily
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

async function updateHabit(profileId, habitId, fields) {
    const { data, error } = await supabase
        .from('habits')
        .update({ ...fields })
        .eq('profile_id', profileId)
        .eq('id', habitId)
        .is('deleted_at', null)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}

// Soft-delete habit only — habit_logs are intentionally NOT deleted.
// Historical log data stays intact so past streaks remain accurate
// even after a habit is deleted. Logs are only removed on hard delete.
async function softDeleteHabit(profileId, habitId) {
    const { data, error } = await supabase
        .from('habits')
        .update({ deleted_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .eq('id', habitId)
        .is('deleted_at', null)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function restoreHabit(profileId, habitId) {
    const { data, error } = await supabase
        .from('habits')
        .update({ deleted_at: null })
        .eq('profile_id', profileId)
        .eq('id', habitId)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function hardDeleteHabit(profileId, habitId) {
    await supabase
        .from('habit_logs')
        .delete()
        .eq('habit_id', habitId)
        .eq('profile_id', profileId);

    const { error } = await supabase
        .from('habits')
        .delete()
        .eq('profile_id', profileId)
        .eq('id', habitId);

    if (error) throw error;
}

// --- STREAK & QUOTA COMPUTATION ---
// Computed live from habit_logs — never stored, never cached.
// Week boundary now honors the profile's actual timezone and
// week_starts_on setting (previously hardcoded to UTC Sunday).

// Days from dateStr `a` to dateStr `b`, inclusive-count style
// (same calendar date = 0). Pure date-string arithmetic, no
// timezone conversion needed.
function daysBetween(aStr, bStr) {
    const [y1, m1, d1] = aStr.split('-').map(Number);
    const [y2, m2, d2] = bStr.split('-').map(Number);
    const t1 = Date.UTC(y1, m1 - 1, d1);
    const t2 = Date.UTC(y2, m2 - 1, d2);
    return Math.round((t2 - t1) / (24 * 60 * 60 * 1000));
}

// Counts how many times a habit was completed in the local week
// containing `date`. timeZone/weekStartsOn come from the profile's
// settings — caller fetches those once and passes them in.
async function getWeeklyCompletionCount(habitId, timeZone, weekStartsOn, date = new Date()) {
    const weekStartStr = getLocalWeekStartDateString(timeZone, weekStartsOn, date);
    const weekEndStr = addDaysToDateString(weekStartStr, 6);

    const { data, error } = await supabase
        .from('habit_logs')
        .select('id', { count: 'exact' })
        .eq('habit_id', habitId)
        .eq('completed', true)
        .gte('log_date', weekStartStr)
        .lte('log_date', weekEndStr);

    if (error) throw error;
    return data.length;
}

// Computes the current consecutive-week streak for a habit, in the
// profile's local calendar weeks. A week "counts" if completions >=
// target_per_week for that week. Walks backwards week by week from
// the current local week until it finds one that didn't meet quota.
async function computeStreak(habitId, targetPerWeek, timeZone, weekStartsOn) {
    let streak = 0;
    let weekStartStr = getLocalWeekStartDateString(timeZone, weekStartsOn);
    const todayStr = getLocalDateString(timeZone);

    // Check up to 52 weeks back (1 year max lookback)
    for (let i = 0; i < 52; i++) {
        const weekEndStr = addDaysToDateString(weekStartStr, 6);

        const { data, error } = await supabase
            .from('habit_logs')
            .select('log_date')
            .eq('habit_id', habitId)
            .eq('completed', true)
            .gte('log_date', weekStartStr)
            .lte('log_date', weekEndStr);

        if (error) throw error;

        const count = data.length;

        // Current week (i === 0): partial week is OK — don't break streak
        // just because the week isn't over yet. Only break if quota is
        // already impossible given days remaining, measured from the
        // profile's LOCAL today, not the server's UTC day.
        if (i === 0) {
            const daysLeftInWeek = daysBetween(todayStr, weekEndStr) + 1; // +1 includes today itself
            const possibleTotal = count + daysLeftInWeek;
            if (possibleTotal < targetPerWeek && count < targetPerWeek) {
                break;
            }
        } else {
            if (count < targetPerWeek) break;
        }

        if (count >= targetPerWeek) streak++;

        weekStartStr = addDaysToDateString(weekStartStr, -7);
    }

    return streak;
}

module.exports = {
    listHabits,
    getHabitById,
    createHabit,
    updateHabit,
    softDeleteHabit,
    restoreHabit,
    hardDeleteHabit,
    getWeeklyCompletionCount,
    computeStreak,
};