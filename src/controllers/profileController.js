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

    const trimmedName = name.trim();

    try {
        const existingCount = await profileService.countProfilesForUser(req.userId);
        if (existingCount >= MAX_PROFILES_PER_USER) {
            return res.status(400).json({ error: `Maximum of ${MAX_PROFILES_PER_USER} profiles per account.` });
        }

        // Check for duplicate profile name for this user
        const profiles = await profileService.listProfilesForUser(req.userId);
        const duplicate = profiles.find(p => p.name.toLowerCase() === trimmedName.toLowerCase());
        if (duplicate) {
            return res.status(400).json({ error: 'A profile with this name already exists.' });
        }

        const profile = await profileService.createProfile(req.userId, trimmedName);
        await settingsService.createDefaultSettings(profile.id);

        return res.status(201).json({ profile });
    } catch (err) {
        console.error('Create profile error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

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

async function renameProfile(req, res) {
    const { name } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Profile name is required.' });
    }

    const trimmedName = name.trim();

    try {
        // Check for duplicate profile name for this user (excluding the profile being renamed)
        const profiles = await profileService.listProfilesForUser(req.userId);
        const duplicate = profiles.find(p =>
            p.id !== req.params.id && p.name.toLowerCase() === trimmedName.toLowerCase()
        );
        if (duplicate) {
            return res.status(400).json({ error: 'A profile with this name already exists.' });
        }

        const profile = await profileService.renameProfile(req.userId, req.params.id, trimmedName);
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found.' });
        }
        return res.status(200).json({ profile });
    } catch (err) {
        console.error('Rename profile error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

// Cascade-deletes ALL of this profile's data — irreversible. Blocked
// if it's the caller's currently active profile (req.profileId, from
// the access token) — deleting the profile you're signed into would
// leave your current session referencing a profile that no longer
// exists. Also blocked if it's the user's last remaining profile —
// every account must always have at least one.
async function deleteProfile(req, res) {
    const targetProfileId = req.params.id;

    if (targetProfileId === req.profileId) {
        return res.status(400).json({
            error: 'Cannot delete the profile you are currently using. Switch to a different profile first.',
        });
    }

    try {
        const profile = await profileService.findProfileForUser(req.userId, targetProfileId);
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found.' });
        }

        const count = await profileService.countProfilesForUser(req.userId);
        if (count <= 1) {
            return res.status(400).json({ error: 'Cannot delete your only remaining profile.' });
        }

        await profileService.deleteProfile(req.userId, targetProfileId);
        return res.status(204).send();
    } catch (err) {
        console.error('Delete profile error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

module.exports = { listProfiles, createProfile, selectProfile, renameProfile, deleteProfile };