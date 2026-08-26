const supabase = require('../config/supabase');

// Settings has exactly one row per profile (profile_id is the PK).
// No create/delete needed — the row is created at signup and lives
// as long as the profile does.

async function getSettings(profileId) {
    const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('profile_id', profileId)
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function updateSettings(profileId, fields) {
    const { data, error } = await supabase
        .from('settings')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}

// Called once, right after a profile is created (signup's default
// profile AND every additional profile via POST /api/profiles).
// All columns except profile_id have DB defaults, so this is a
// minimal insert — timezone/theme/week_starts_on come from schema.sql.
// Optional timezone param allows auto-detected browser timezone at signup.
async function createDefaultSettings(profileId, timezone = null) {
    const insertData = { profile_id: profileId };
    if (timezone) {
        insertData.timezone = timezone;
    }
    const { data, error } = await supabase
        .from('settings')
        .insert(insertData)
        .select()
        .single();

    if (error) throw error;
    return data;
}

module.exports = { getSettings, updateSettings, createDefaultSettings };