const supabase = require('../config/supabase');

/**
 * Resolves the list of profile IDs to query based on the profile_ids query param.
 * Supports three modes:
 * - null/undefined: single profile (active profile only) - uses req.profileId
 * - 'all': all profiles belonging to the user
 * - comma-separated list: specific profile IDs (validates ownership)
 *
 * @param {string} userId - The authenticated user's ID
 * @param {string} activeProfileId - The currently active profile ID (from JWT)
 * @param {string|null} profileIdsParam - The profile_ids query parameter
 * @returns {Promise<string[]>} Array of profile IDs to query
 * @throws {Error} With statusCode property for HTTP errors
 */
async function resolveProfileIds(userId, activeProfileId, profileIdsParam) {
    // No profile_ids param = single profile mode (backward compatible)
    if (!profileIdsParam || profileIdsParam.trim() === '') {
        return [activeProfileId];
    }

    const param = profileIdsParam.trim().toLowerCase();

    // 'all' keyword = all user profiles
    if (param === 'all') {
        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('id')
            .eq('user_id', userId)
            .is('deleted_at', null);

        if (error) throw error;
        return profiles.map(p => p.id);
    }

    // Comma-separated list of profile IDs
    const requestedIds = param.split(',').map(id => id.trim()).filter(Boolean);

    if (requestedIds.length === 0) {
        return [activeProfileId];
    }

    // Validate all requested profiles belong to the user
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', userId)
        .in('id', requestedIds)
        .is('deleted_at', null);

    if (error) throw error;

    const foundIds = new Set(profiles.map(p => p.id));
    const missingIds = requestedIds.filter(id => !foundIds.has(id));

    if (missingIds.length > 0) {
        // Use 404 to avoid profile enumeration
        const err = new Error('One or more profiles not found.');
        err.statusCode = 404;
        throw err;
    }

    return requestedIds;
}

module.exports = { resolveProfileIds };