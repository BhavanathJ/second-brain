const supabase = require('../config/supabase');
const { getLocalWeekStartDateString, addDaysToDateString, getLocalDateString } = require('../utils/profileTime');

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

async function createHabit(profileId, { title, target_per_week }) {
    const { data, error } = await supabase
        .from('habits')
        .insert({
            profile_id: profileId,
            title,
            target_per_week: target_per_week ?? 7, // default: daily
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

function daysBetween(aStr, bStr) {
    const [y1, m1, d1] = aStr.split('-').map(Number);
    const [y2, m2, d2] = bStr.split('-').map(Number);
    const t1 = Date.UTC(y1, m1 - 1, d1);
    const t2 = Date.UTC(y2, m2 - 1, d2);
    return Math.round((t2 - t1) / (24 * 60 * 60 * 1000));
}

// --- Batch completion math (replaces the per-habit query loop) ---
//
// Previously, listHabits/getHabit issued up to 52 sequential Supabase
// queries per habit (one per week, inside computeStreak). All of that is
// now one query for the whole 52-week window, then pure date-math against
// a Set of logged dates.

// The full date range a streak can ever need: the current week plus up to
// 52 weeks back.
function getStreakWindow(timeZone, weekStartsOn) {
    const currentWeekStart = getLocalWeekStartDateString(timeZone, weekStartsOn);
    return {
        windowStart: addDaysToDateString(currentWeekStart, -51 * 7),
        windowEnd: addDaysToDateString(currentWeekStart, 6),
    };
}

// ONE query: every completed log date for a profile (optionally filtered
// to a single habit) across the 52-week streak window. Rows: { habit_id, log_date }.
async function getCompletedLogs(profileId, timeZone, weekStartsOn, habitId = null) {
    const { windowStart, windowEnd } = getStreakWindow(timeZone, weekStartsOn);
    let query = supabase
        .from('habit_logs')
        .select('habit_id, log_date')
        .eq('profile_id', profileId)
        .eq('completed', true)
        .gte('log_date', windowStart)
        .lte('log_date', windowEnd);
    if (habitId) query = query.eq('habit_id', habitId);

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

// Group the rows above by habit_id into Set<log_date> for O(1) membership.
function buildHabitLogIndex(logs) {
    const index = new Map();
    for (const log of logs) {
        if (!index.has(log.habit_id)) index.set(log.habit_id, new Set());
        index.get(log.habit_id).add(log.log_date);
    }
    return index;
}

// How many of the 7 dates in a week (weekStartStr .. +6) are logged.
function countInWeek(dateSet, weekStartStr) {
    let count = 0;
    for (let d = 0; d < 7; d++) {
        if (dateSet.has(addDaysToDateString(weekStartStr, d))) count++;
    }
    return count;
}

function weeklyCountForDates(dateSet, timeZone, weekStartsOn) {
    const weekStartStr = getLocalWeekStartDateString(timeZone, weekStartsOn);
    return countInWeek(dateSet, weekStartStr);
}

// Same streak algorithm as before, but reads from a pre-fetched Set of
// log dates instead of issuing a Supabase query per week.
function computeStreakForDates(dateSet, targetPerWeek, timeZone, weekStartsOn) {
    let streak = 0;
    let weekStartStr = getLocalWeekStartDateString(timeZone, weekStartsOn);
    const todayStr = getLocalDateString(timeZone);

    for (let i = 0; i < 52; i++) {
        const weekEndStr = addDaysToDateString(weekStartStr, 6);
        const count = countInWeek(dateSet, weekStartStr);

        if (i === 0) {
            const daysLeftInWeek = daysBetween(todayStr, weekEndStr) + 1;
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
    getCompletedLogs,
    buildHabitLogIndex,
    weeklyCountForDates,
    computeStreakForDates,
};