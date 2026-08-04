const supabase = require('../config/supabase');

async function findUserByEmail(email) {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function findUserById(userId) {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
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

async function updatePassword(userId, newPasswordHash) {
    const { error } = await supabase
        .from('users')
        .update({ password_hash: newPasswordHash })
        .eq('id', userId);

    if (error) throw error;
}

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

async function storeRefreshToken({ userId, profileId, tokenHash, expiresAt }) {
    const { error } = await supabase
        .from('refresh_tokens')
        .insert({ user_id: userId, profile_id: profileId, token_hash: tokenHash, expires_at: expiresAt });

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

// Revokes every active refresh token belonging to this user — every
// device, every profile. Used on password change: an attacker holding
// a stolen refresh token gets logged out the moment the real owner
// changes their password, not left with a still-working session.
async function revokeAllRefreshTokensForUser(userId) {
    const { error } = await supabase
        .from('refresh_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('revoked_at', null);

    if (error) throw error;
}

module.exports = {
    findUserByEmail,
    findUserById,
    createUser,
    updatePassword,
    createDefaultProfile,
    findProfileById,
    findDefaultProfileForUser,
    storeRefreshToken,
    findActiveRefreshToken,
    revokeAllRefreshTokensForUser,
    revokeRefreshToken,
};