const supabase = require('../config/supabase');

// --- USERS ---

async function findUserByEmail(email) {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .maybeSingle(); // returns null instead of throwing if no row found

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
// Every signup creates exactly one default profile — a user should never
// exist with zero profiles, since every content table requires profile_id.
async function createDefaultProfile(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .insert({ user_id: userId, name: 'Default' })
        .select()
        .single();

    if (error) throw error;
    return data;
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

// Used at login/refresh, before real multi-profile selection exists.
// Returns the user's first-created profile (every signup creates exactly
// one). Once a "select active profile" endpoint exists, login/refresh
// should switch to using the user's last-active profile instead.
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

// Looks up an active (not revoked, not expired) refresh token by its hash.
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
