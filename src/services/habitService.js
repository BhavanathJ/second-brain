const supabase = require('../config/supabase');

// --- HABITS CRUD ---

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
    // Hard delete logs first (FK constraint: habit_logs.habit_id → habits.id)
    // then delete the habit row itself.
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
// Week boundary = Sunday (week_starts_on: 0, locked in settings).

// Returns the Sunday of the week containing the given date (UTC).
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getUTCDay(); // 0 = Sunday
    d.setUTCDate(d.getUTCDate() - day);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

// Counts how many times a habit was completed in the week containing `date`.
async function getWeeklyCompletionCount(habitId, date) {
    const weekStart = getWeekStart(date);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    const { data, error } = await supabase
        .from('habit_logs')
        .select('id', { count: 'exact' })
        .eq('habit_id', habitId)
        .eq('completed', true)
        .gte('log_date', weekStart.toISOString().split('T')[0])
        .lte('log_date', weekEnd.toISOString().split('T')[0]);

    if (error) throw error;
    return data.length;
}

// Computes the current consecutive-week streak for a habit.
// A week "counts" if completions >= target_per_week for that week.
// Walks backwards week by week from the current week until it finds
// a week that didn't meet quota — that's where the streak ends.
async function computeStreak(habitId, targetPerWeek) {
    let streak = 0;
    let weekStart = getWeekStart(new Date());
    const today = new Date().toISOString().split('T')[0];

    // Check up to 52 weeks back (1 year max lookback)
    for (let i = 0; i < 52; i++) {
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

        const startStr = weekStart.toISOString().split('T')[0];
        const endStr = weekEnd.toISOString().split('T')[0];

        const { data, error } = await supabase
            .from('habit_logs')
            .select('log_date')
            .eq('habit_id', habitId)
            .eq('completed', true)
            .gte('log_date', startStr)
            .lte('log_date', endStr);

        if (error) throw error;

        const count = data.length;

        // Current week (i === 0): partial week is OK — don't break streak
        // just because the week isn't over yet. Only break if quota is
        // already impossible (e.g. today is Saturday, need 7, have 0).
        if (i === 0) {
            const daysLeftInWeek = 6 - new Date().getUTCDay();
            const possibleTotal = count + daysLeftInWeek + 1; // +1 for today
            if (possibleTotal < targetPerWeek && count < targetPerWeek) {
                // Quota unreachable this week — streak already broken
                break;
            }
        } else {
            if (count < targetPerWeek) break;
        }

        if (count >= targetPerWeek) streak++;

        // Move to previous week
        weekStart.setUTCDate(weekStart.getUTCDate() - 7);
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