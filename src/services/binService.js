const supabase = require('../config/supabase');

async function logDeletion(profileId, entityType, entityId) {
    const { error } = await supabase
        .from('bin_entries')
        .insert({ profile_id: profileId, entity_type: entityType, entity_id: entityId });

    if (error) throw error;
}

async function listBinEntries(profileId) {
    const { data, error } = await supabase
        .from('bin_entries')
        .select('*')
        .eq('profile_id', profileId)
        .order('deleted_at', { ascending: false });

    if (error) throw error;
    return data;
}

async function getBinEntryById(profileId, binEntryId) {
    const { data, error } = await supabase
        .from('bin_entries')
        .select('*')
        .eq('profile_id', profileId)
        .eq('id', binEntryId)
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function removeBinEntry(profileId, binEntryId) {
    const { error } = await supabase
        .from('bin_entries')
        .delete()
        .eq('profile_id', profileId)
        .eq('id', binEntryId);

    if (error) throw error;
}

async function getExpiredBinEntries() {
    const { data, error } = await supabase
        .from('bin_entries')
        .select('*')
        .lte('auto_purge_at', new Date().toISOString());

    if (error) throw error;
    return data;
}

module.exports = {
    logDeletion,
    listBinEntries,
    getBinEntryById,
    removeBinEntry,
    getExpiredBinEntries,
};