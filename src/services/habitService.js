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

async function computeStreak(habitId, targetPerWeek, timeZone, weekStartsOn) {
    let streak = 0;
    let weekStartStr = getLocalWeekStartDateString(timeZone, weekStartsOn);
    const todayStr = getLocalDateString(timeZone);

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
    getWeeklyCompletionCount,
    computeStreak,
};