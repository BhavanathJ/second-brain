const supabase = require('../config/supabase');

// --- USERS ---

async function findUserByEmail(email) {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function createUser({ email, passwordHash }) {
    const { data, error } = await supabase
        .from('users')
        .insert({ email, password_hash: passwordHash })
        .select()
        .single();

    if (error) throw error;
    return data;
}

// --- PROFILES ---

// Creates the default profile AND its settings row in one function.
// A profile must never exist without a settings row — profile_id is the
// PK on settings, so if this insert is missing, every settings read will
// return null and confuse the frontend.
async function createDefaultProfile(userId) {
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .insert({ user_id: userId, name: 'Default' })
        .select()
        .single();

    if (profileError) throw profileError;

    // Insert default settings row for this profile immediately.
    // Schema defaults (timezone: 'Asia/Kolkata', theme: 'light',
    // week_starts_on: 0) apply automatically — no need to pass values.
    const { error: settingsError } = await supabase
        .from('settings')
        .insert({ profile_id: profile.id });

    if (settingsError) throw settingsError;

    return profile;
}

async function findProfileById(profileId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profileId)
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function findDefaultProfileForUser(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return data;
}

// --- REFRESH TOKENS ---

async function storeRefreshToken({ userId, tokenHash, expiresAt }) {
    const { error } = await supabase
        .from('refresh_tokens')
        .insert({ user_id: userId, token_hash: tokenHash, expires_at: expiresAt });

    if (error) throw error;
}

async function findActiveRefreshToken(tokenHash) {
    const { data, error } = await supabase
        .from('refresh_tokens')
        .select('*')
        .eq('token_hash', tokenHash)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function revokeRefreshToken(tokenHash) {
    const { error } = await supabase
        .from('refresh_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('token_hash', tokenHash);

    if (error) throw error;
}

module.exports = {
    findUserByEmail,
    createUser,
    createDefaultProfile,
    findProfileById,
    findDefaultProfileForUser,
    storeRefreshToken,
    findActiveRefreshToken,
    revokeRefreshToken,
};