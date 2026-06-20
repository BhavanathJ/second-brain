const supabase = require('../config/supabase');

// Every query here filters deleted_at IS NULL by default — callers never
// have to remember this. The one exception (Bin restore/list) will live
// in its own binService.js later, not here, so this file can stay
// "tasks as the user currently sees them" with no exceptions.

async function listTasks(profileId, { urgent, important, status } = {}) {
    let query = supabase
        .from('tasks')
        .select('*')
        .eq('profile_id', profileId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

    // Only apply a filter if it was actually provided — undefined means
    // "don't care", not "false". This is what lets /tasks?urgent=true work
    // independently from /tasks?status=done, or combined.
    if (urgent !== undefined) query = query.eq('urgent', urgent);
    if (important !== undefined) query = query.eq('important', important);
    if (status !== undefined) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

async function getTaskById(profileId, taskId) {
    const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('profile_id', profileId)
        .eq('id', taskId)
        .is('deleted_at', null)
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function createTask(profileId, { title, description, urgent, important, dueAt }) {
    const { data, error } = await supabase
        .from('tasks')
        .insert({
            profile_id: profileId,
            title,
            description: description ?? null,
            urgent: urgent ?? false,
            important: important ?? false,
            due_at: dueAt ?? null,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

async function updateTask(profileId, taskId, fields) {
    // Only fields explicitly present in `fields` get updated — this is a
    // PATCH, not a PUT. Sending { title: "new" } shouldn't wipe out
    // due_at just because it wasn't included in this particular request.
    const { data, error } = await supabase
        .from('tasks')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .eq('id', taskId)
        .is('deleted_at', null)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}

// Soft-delete: sets deleted_at, does NOT remove the row. Writing the
// bin_entries row is the controller's job (it touches a different
// table/service, keeping this file focused on tasks only).
async function softDeleteTask(profileId, taskId) {
    const { data, error } = await supabase
        .from('tasks')
        .update({ deleted_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .eq('id', taskId)
        .is('deleted_at', null)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}

module.exports = { listTasks, getTaskById, createTask, updateTask, softDeleteTask };