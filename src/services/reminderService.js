const supabase = require('../config/supabase');

async function listReminders(profileId, { isDone } = {}) {
    let query = supabase
        .from('reminders')
        .select('*')
        .eq('profile_id', profileId)
        .is('deleted_at', null)
        .order('remind_at', { ascending: true });

    if (isDone !== undefined) query = query.eq('is_done', isDone);

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

async function getReminderById(profileId, reminderId) {
    const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('profile_id', profileId)
        .eq('id', reminderId)
        .is('deleted_at', null)
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function createReminder(profileId, { title, remindAt, entityType, entityId }) {
    const { data, error } = await supabase
        .from('reminders')
        .insert({
            profile_id: profileId,
            title,
            remind_at: remindAt,
            entity_type: entityType ?? null,
            entity_id: entityId ?? null,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

async function updateReminder(profileId, reminderId, fields) {
    const { data, error } = await supabase
        .from('reminders')
        .update({ ...fields })
        .eq('profile_id', profileId)
        .eq('id', reminderId)
        .is('deleted_at', null)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function softDeleteReminder(profileId, reminderId) {
    const { data, error } = await supabase
        .from('reminders')
        .update({ deleted_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .eq('id', reminderId)
        .is('deleted_at', null)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function restoreReminder(profileId, reminderId) {
    const { data, error } = await supabase
        .from('reminders')
        .update({ deleted_at: null })
        .eq('profile_id', profileId)
        .eq('id', reminderId)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function hardDeleteReminder(profileId, reminderId) {
    const { error } = await supabase
        .from('reminders')
        .delete()
        .eq('profile_id', profileId)
        .eq('id', reminderId);

    if (error) throw error;
}

// Called by cron job every minute — fires across all profiles at once.
async function fireReminders() {
    const { data, error } = await supabase
        .from('reminders')
        .update({ is_done: true })
        .lte('remind_at', new Date().toISOString())
        .eq('is_done', false)
        .is('deleted_at', null)
        .select();

    if (error) throw error;

    if (data && data.length > 0) {
        console.log(`[cron] Fired ${data.length} reminder(s):`, data.map(r => r.title));
    }

    return data;
}

module.exports = {
    listReminders,
    getReminderById,
    createReminder,
    updateReminder,
    softDeleteReminder,
    restoreReminder,
    hardDeleteReminder,
    fireReminders,
};