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

// Ownership check baked into the query itself — eq('user_id', ...) AND
// eq('id', ...) in one call, rather than fetching by id then comparing
// in JS. A profile that exists but belongs to someone else returns
// null here, same as a profile that doesn't exist at all.
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

module.exports = {
    listProfilesForUser,
    countProfilesForUser,
    createProfile,
    findProfileForUser,
};