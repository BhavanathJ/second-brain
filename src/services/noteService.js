const supabase = require('../config/supabase');

async function listNotes(profileId, { tags } = {}) {
    let query = supabase
        .from('notes')
        .select('*')
        .eq('profile_id', profileId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

    if (tags && tags.length > 0) {
        query = query.contains('tags', tags);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

async function getNoteById(profileId, noteId) {
    const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('profile_id', profileId)
        .eq('id', noteId)
        .is('deleted_at', null)
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function createNote(profileId, { content, tags }) {
    const { data, error } = await supabase
        .from('notes')
        .insert({
            profile_id: profileId,
            content,
            tags: tags ?? [],
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

async function updateNote(profileId, noteId, fields) {
    const { data, error } = await supabase
        .from('notes')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .eq('id', noteId)
        .is('deleted_at', null)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}

// Conditional write - only succeeds if the note is still unconverted.
// Guards against two concurrent conversion requests both winning: the
// second one gets `null` back instead of silently overwriting the
// first request's converted_task_id.
async function markNoteConverted(profileId, noteId, taskId) {
    const { data, error } = await supabase
        .from('notes')
        .update({
            converted_task_id: taskId,
            updated_at: new Date().toISOString(),
        })
        .eq('profile_id', profileId)
        .eq('id', noteId)
        .is('deleted_at', null)
        .is('converted_task_id', null)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data; // null if already converted by a concurrent request
}

async function softDeleteNote(profileId, noteId) {
    const { data, error } = await supabase
        .from('notes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .eq('id', noteId)
        .is('deleted_at', null)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function restoreNote(profileId, noteId) {
    const { data, error } = await supabase
        .from('notes')
        .update({ deleted_at: null, updated_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .eq('id', noteId)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function hardDeleteNote(profileId, noteId) {
    const { error } = await supabase
        .from('notes')
        .delete()
        .eq('profile_id', profileId)
        .eq('id', noteId);

    if (error) throw error;
}

// Find note by converted_task_id and clear it (when converted task is deleted)
async function clearConvertedTaskId(profileId, taskId) {
    const { data, error } = await supabase
        .from('notes')
        .update({ converted_task_id: null, updated_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .eq('converted_task_id', taskId)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}

module.exports = {
    listNotes,
    getNoteById,
    createNote,
    updateNote,
    markNoteConverted,
    softDeleteNote,
    restoreNote,
    hardDeleteNote,
    clearConvertedTaskId,
};