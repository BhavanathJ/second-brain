const profileService = require('../services/profileService');

// Resolves a profile_ids request param into a validated array of profile
// IDs the given user actually owns. NEVER trust a client-supplied profile
// id without checking ownership first.
//
// - profileIdsParam is undefined/null/empty -> returns [defaultProfileId]
//   (today's exact behavior, unchanged — this is what preserves backward
//   compatibility with every existing test and every existing frontend call)
// - profileIdsParam === 'all' -> returns every profile id owned by userId
// - profileIdsParam is a comma-separated string of ids -> returns that
//   exact list, after verifying every id in it belongs to userId
async function resolveProfileIds(userId, defaultProfileId, profileIdsParam) {
    if (!profileIdsParam) {
        return [defaultProfileId];
    }

    const owned = await profileService.listProfilesForUser(userId);
    const ownedIds = new Set(owned.map(p => p.id));

    if (profileIdsParam === 'all') {
        return Array.from(ownedIds);
    }

    const requested = profileIdsParam.split(',').map(s => s.trim()).filter(Boolean);
    const invalid = requested.filter(id => !ownedIds.has(id));
    if (invalid.length > 0) {
        const err = new Error('One or more profile_ids do not belong to this account.');
        err.statusCode = 403;
        throw err;
    }
    return requested;
}

// Verifies a single profile_id belongs to userId. Returns true/false —
// does not throw, so the caller decides whether to respond 404 (to avoid
// leaking existence of another user's data, matching this codebase's
// existing pattern for cross-account access) or something else.
async function verifyProfileOwnership(userId, profileId) {
    const profile = await profileService.findProfileForUser(userId, profileId);
    return !!profile;
}

module.exports = { resolveProfileIds, verifyProfileOwnership };