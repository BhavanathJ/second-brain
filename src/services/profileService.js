const supabase = require('../config/supabase');

async function listProfilesForUser(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
}

async function countProfilesForUser(userId) {
    const { count, error } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

    if (error) throw error;
    return count;
}

async function createProfile(userId, name) {
    const { data, error } = await supabase
        .from('profiles')
        .insert({ user_id: userId, name })
        .select()
        .single();

    if (error) throw error;
    return data;
}

async function findProfileForUser(userId, profileId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .eq('id', profileId)
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function renameProfile(userId, profileId, name) {
    const { data, error } = await supabase
        .from('profiles')
        .update({ name })
        .eq('user_id', userId)
        .eq('id', profileId)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}

// Cascade-deletes every task/note/habit/reminder/event/bin-entry/
// settings row tied to this profile, via the DB's ON DELETE CASCADE —
// irreversible, no soft-delete, no Bin recovery. Callers must have
// already confirmed this is genuinely intended (see profileController).
async function deleteProfile(userId, profileId) {
    const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('user_id', userId)
        .eq('id', profileId);

    if (error) throw error;
}

module.exports = {
    listProfilesForUser,
    countProfilesForUser,
    createProfile,
    findProfileForUser,
    renameProfile,
    deleteProfile,
};