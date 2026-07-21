const supabase = require('../config/supabase');

// Every query filters deleted_at IS NULL — same discipline as taskService.
// The one exception (Bin restore) lives in binService, not here.

async function listNotes(profileId, { tags } = {}) {
    let query = supabase
        .from('notes')
        .select('*')
        .eq('profile_id', profileId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

    // tags is an array of strings e.g. ["work", "ideas"].
    // cs = "contains" — returns notes whose tags array contains ALL of
    // the requested tags. e.g. ?tags=work,ideas only returns notes tagged
    // with both, not just one of them.
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

// Called after a task has already been created from this note's content.
// Writes the task's id back onto the note so the link is traceable both ways.
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

module.exports = {
    listNotes,
    getNoteById,
    createNote,
    updateNote,
    markNoteConverted,
    softDeleteNote,
};