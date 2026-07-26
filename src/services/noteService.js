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
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
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

module.exports = {
    listNotes,
    getNoteById,
    createNote,
    updateNote,
    markNoteConverted,
    softDeleteNote,
    restoreNote,
    hardDeleteNote,
};