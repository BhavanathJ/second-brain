const supabase = require('../config/supabase');

// Every query filters deleted_at IS NULL and scopes to profile_id.
// entity_type / entity_id are nullable — NULL means standalone reminder,
// set means attached to a task / habit / calendar_event / note.

async function listReminders(profileId, { isDone } = {}) {
    let query = supabase
        .from('reminders')
        .select('*')
        .eq('profile_id', profileId)
        .is('deleted_at', null)
        .order('remind_at', { ascending: true }); // soonest first

    // undefined = "show all", true = only fired, false = only pending
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
            entity_type: entityType ?? null,  // null = standalone
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

// Called by the cron job every minute. Finds all reminders across ALL
// profiles whose remind_at has passed and aren't fired yet, marks them
// done. Notification delivery (push/email) plugs in here later — for
// now, marking is_done = true is the "fired" state.
async function fireReminders() {
    const { data, error } = await supabase
        .from('reminders')
        .update({ is_done: true })
        .lte('remind_at', new Date().toISOString()) // remind_at <= now
        .eq('is_done', false)
        .is('deleted_at', null)
        .select();

    if (error) throw error;

    // data = array of reminders that just fired. Empty array = nothing due.
    // When you add push/email notifications later, iterate data here and
    // send one notification per fired reminder.
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
    fireReminders,
};