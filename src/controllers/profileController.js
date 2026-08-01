const profileService = require('../services/profileService');
const settingsService = require('../services/settingsService');
const { issueTokenPair } = require('./authController');

const MAX_PROFILES_PER_USER = 5;

async function listProfiles(req, res) {
    try {
        const profiles = await profileService.listProfilesForUser(req.userId);
        return res.status(200).json({ profiles });
    } catch (err) {
        console.error('List profiles error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function createProfile(req, res) {
    const { name } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Profile name is required.' });
    }

    try {
        const existingCount = await profileService.countProfilesForUser(req.userId);
        if (existingCount >= MAX_PROFILES_PER_USER) {
            return res.status(400).json({ error: `Maximum of ${MAX_PROFILES_PER_USER} profiles per account.` });
        }

        const profile = await profileService.createProfile(req.userId, name.trim());
        // Every profile needs exactly one settings row — created here,
        // not lazily, so Settings never 404s for a profile that exists.
        await settingsService.createDefaultSettings(profile.id);

        return res.status(201).json({ profile });
    } catch (err) {
        console.error('Create profile error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

// Switches the active session to a different one of the user's own
// profiles. Issues a brand new token pair scoped to that profile —
// this is the endpoint that actually exercises the refresh_tokens
// profile_id fix: the new refresh token is stored with this profileId,
// so it stays correct across future silent refreshes.
async function selectProfile(req, res) {
    try {
        const profile = await profileService.findProfileForUser(req.userId, req.params.id);
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found.' });
        }

        const tokens = await issueTokenPair({ userId: req.userId, profileId: profile.id });

        return res.status(200).json({ profile, ...tokens });
    } catch (err) {
        console.error('Select profile error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

module.exports = { listProfiles, createProfile, selectProfile };