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

// Resolves target_profile_id from the request body. If omitted, returns defaultProfileId.
// If provided and different, validates it is a string UUID and verifies ownership using verifyProfileOwnership.
// Throws a 400 error on any validation or ownership failure (never 403).
async function resolveTargetProfile(req, defaultProfileId = req.profileId) {
    if (req.body.profile_id !== undefined) {
        if (req.body.profile_id !== null && (typeof req.body.profile_id !== 'string' || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(req.body.profile_id))) {
            const err = new Error('Invalid profile_id format.');
            err.statusCode = 400;
            throw err;
        }
        if (req.body.profile_id !== null) {
            const ownsLegacy = await verifyProfileOwnership(req.userId, req.body.profile_id);
            if (!ownsLegacy) {
                const err = new Error('Cannot create item: profile not owned by user.');
                err.statusCode = 404;
                throw err;
            }
        }
    }

    const targetProfileId = req.body.target_profile_id;
    
    if (targetProfileId === undefined) {
        return defaultProfileId;
    }
    
    if (typeof targetProfileId !== 'string' || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(targetProfileId) && !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(targetProfileId)) {
        const err = new Error('Invalid target_profile_id format.');
        err.statusCode = 400;
        throw err;
    }
    
    if (targetProfileId === defaultProfileId) {
        return defaultProfileId;
    }
    
    const owns = await verifyProfileOwnership(req.userId, targetProfileId);
    if (!owns) {
        const err = new Error('Target profile not found or not owned by user.');
        err.statusCode = 400;
        throw err;
    }
    
    return targetProfileId;
}

module.exports = { resolveProfileIds, verifyProfileOwnership, resolveTargetProfile };