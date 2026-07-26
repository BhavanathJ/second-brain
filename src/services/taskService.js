const supabase = require('../config/supabase');

async function listTasks(profileId, { urgent, important, status } = {}) {
    let query = supabase
        .from('tasks')
        .select('*')
        .eq('profile_id', profileId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

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

// Restore: clears deleted_at so the task reappears in normal queries.
async function restoreTask(profileId, taskId) {
    const { data, error } = await supabase
        .from('tasks')
        .update({ deleted_at: null, updated_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .eq('id', taskId)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}

// Permanent delete: removes the row entirely. Called from Bin only —
// normal task deletion always uses softDeleteTask.
async function hardDeleteTask(profileId, taskId) {
    const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('profile_id', profileId)
        .eq('id', taskId);

    if (error) throw error;
}

module.exports = {
    listTasks,
    getTaskById,
    createTask,
    updateTask,
    softDeleteTask,
    restoreTask,
    hardDeleteTask,
};