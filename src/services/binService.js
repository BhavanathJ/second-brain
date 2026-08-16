const supabase = require('../config/supabase');
const noteService = require('./noteService');

const ENTITY_LABEL_CONFIG = {
    task: { table: 'tasks', column: 'title' },
    note: { table: 'notes', column: 'content' },
    habit: { table: 'habits', column: 'title' },
    reminder: { table: 'reminders', column: 'title' },
    calendar_event: { table: 'calendar_events', column: 'title' },
};

async function logDeletion(profileId, entityType, entityId) {
    const { error } = await supabase
        .from('bin_entries')
        .insert({ profile_id: profileId, entity_type: entityType, entity_id: entityId });

    if (error) throw error;
}

// bin_entries only stores entity_type/entity_id — not the entity's own
// title/content — so this batches a second query per entity_type to
// fetch a human-readable label for each entry. Soft-deleted rows still
// exist in their original table (deleted_at set, row not removed), so
// this reads them directly, no special "trash" storage involved.
async function listBinEntries(profileId) {
    const { data, error } = await supabase
        .from('bin_entries')
        .select('*')
        .eq('profile_id', profileId)
        .order('deleted_at', { ascending: false });

    if (error) throw error;

    const grouped = {};
    for (const entry of data) {
        if (!grouped[entry.entity_type]) grouped[entry.entity_type] = [];
        grouped[entry.entity_type].push(entry.entity_id);
    }

    const labelMap = {};

    await Promise.all(
        Object.entries(grouped).map(async ([entityType, ids]) => {
            const config = ENTITY_LABEL_CONFIG[entityType];
            if (!config) return;
            const { data: rows, error: rowsError } = await supabase
                .from(config.table)
                .select(`id, ${config.column}`)
                .in('id', ids);
            if (rowsError) throw rowsError;
            rows.forEach(row => {
                labelMap[row.id] = row[config.column];
            });
        })
    );

    return data.map(entry => ({
        ...entry,
        // Truncate — notes' content can be long, titles rarely are.
        // Falls back gracefully if the underlying row is somehow gone
        // (e.g. a race with the purge cron) rather than showing undefined.
        label: (labelMap[entry.entity_id] ?? '(content unavailable)').slice(0, 100),
    }));
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