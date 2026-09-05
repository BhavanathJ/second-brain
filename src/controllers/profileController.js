const profileService = require('../services/profileService');
const settingsService = require('../services/settingsService');
const { issueTokenPair, revokeRefreshTokenByRaw } = require('./authController');
const authService = require('../services/authService');
const { normalizeTimezone, isValidTimezone } = require('../utils/timezone');

// Reserved colors that must not be used for profile badges (Signal's semantic alert/success colors)
const RESERVED_COLORS = new Set([
    '#C74530', // danger red
    '#4A7C59', // success green
    '#D97157', // warning orange
    '#6FA57E', // success green variant
]);

// Pre-vetted safe rotation for auto-assignment (none are in RESERVED_COLORS)
const AUTO_COLOR_ROTATION = [
    '#2563EB', // blue
    '#7C3AED', // violet
    '#DB2777', // pink
    '#EA580C', // orange
    '#0D9488', // teal
    '#4F46E5', // indigo
    '#65A30D', // lime
    '#0891B2', // cyan
];

// Validate a manually-provided color string
function validateColor(color, userId, excludeProfileId = null) {
    // a. Must match hex format
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
        return { valid: false, error: 'Color must be a valid hex color (e.g., #2563EB).' };
    }

    const upperColor = color.toUpperCase();

    // b. Must not be a reserved value (case-insensitive)
    if (RESERVED_COLORS.has(upperColor)) {
        return { valid: false, error: 'This color is reserved for system indicators and cannot be used.' };
    }

    // c. Must not match another profile's color for the same user (case-insensitive)
    // Note: this is checked in the controller where we have access to the profile list

    return { valid: true };
}

// Auto-assign a color not already used by the user's other profiles
async function autoAssignColor(userId) {
    const profiles = await profileService.listProfilesForUser(userId);
    const usedColors = new Set(profiles.map(p => (p.color || '#6B7280').toUpperCase()));

    for (const color of AUTO_COLOR_ROTATION) {
        if (!usedColors.has(color.toUpperCase())) {
            return color;
        }
    }

    // All colors taken - wrap around to first available (should be very rare)
    return AUTO_COLOR_ROTATION[0];
}

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
    const { name, timezone } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Profile name is required.' });
    }

    const trimmedName = name.trim();

    // Validate timezone if provided
    let validatedTimezone = null;
    if (timezone && isValidTimezone(timezone)) {
        validatedTimezone = normalizeTimezone(timezone);
    }

    try {

        // Check for duplicate profile name for this user
        const profiles = await profileService.listProfilesForUser(req.userId);
        const duplicate = profiles.find(p => p.name.toLowerCase() === trimmedName.toLowerCase());
        if (duplicate) {
            return res.status(400).json({ error: 'A profile with this name already exists.' });
        }

        // Auto-assign a color not already used by this user's profiles
        const assignedColor = await autoAssignColor(req.userId);

        const profile = await profileService.createProfile(req.userId, trimmedName, assignedColor);
        await settingsService.createDefaultSettings(profile.id, validatedTimezone);

        return res.status(201).json({ profile });
    } catch (err) {
        console.error('Create profile error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function selectProfile(req, res) {
    const { refreshToken: oldRefreshToken } = req.body;
    try {
        const profile = await profileService.findProfileForUser(req.userId, req.params.id);
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found.' });
        }

        // Revoke the session's current refresh token before issuing a new one —
        // otherwise switching profiles N times leaves N live, unrevoked
        // refresh_tokens rows for the same device, each one still valid.
        if (oldRefreshToken) {
            await revokeRefreshTokenByRaw(oldRefreshToken);
        }

        const user = await authService.findUserById(req.userId);
        const tokens = await issueTokenPair({ userId: req.userId, profileId: profile.id, username: user.username });

        return res.status(200).json({ profile, ...tokens });
    } catch (err) {
        console.error('Select profile error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function renameProfile(req, res) {
    const { name, color } = req.body;

    // Validate that at least one field is provided
    if ((!name || !name.trim()) && color === undefined) {
        return res.status(400).json({ error: 'Profile name or color is required.' });
    }

    const trimmedName = name?.trim();

    // Validate color if provided
    if (color !== undefined) {
        const validation = validateColor(color, req.userId, req.params.id);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        // Check for duplicate color among other profiles of this user
        const profiles = await profileService.listProfilesForUser(req.userId);
        const duplicateColor = profiles.find(p =>
            p.id !== req.params.id && (p.color || '#6B7280').toUpperCase() === color.toUpperCase()
        );
        if (duplicateColor) {
            return res.status(400).json({ error: 'Another profile already uses this color.' });
        }
    }

    try {
        // Check for duplicate profile name for this user (excluding the profile being renamed)
        if (trimmedName) {
            const profiles = await profileService.listProfilesForUser(req.userId);
            const duplicate = profiles.find(p =>
                p.id !== req.params.id && p.name.toLowerCase() === trimmedName.toLowerCase()
            );
            if (duplicate) {
                return res.status(400).json({ error: 'A profile with this name already exists.' });
            }
        }

        const profile = await profileService.updateProfile(req.userId, req.params.id, {
            name: trimmedName,
            color,
        });
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found.' });
        }
        return res.status(200).json({ profile });
    } catch (err) {
        console.error('Update profile error:', err);
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