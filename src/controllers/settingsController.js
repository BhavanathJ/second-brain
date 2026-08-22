const settingsService = require('../services/settingsService');

const VALID_THEMES = ['light', 'dark', 'system'];
const VALID_WEEK_STARTS = [0, 1]; // 0 = Sunday, 1 = Monday
const VALID_TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'));

async function getSettings(req, res) {
    try {
        const settings = await settingsService.getSettings(req.profileId);
        if (!settings) {
            return res.status(404).json({ error: 'Settings not found for this profile.' });
        }
        return res.status(200).json({ settings });
    } catch (err) {
        console.error('Get settings error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function updateSettings(req, res) {
    const allowedFields = ['timezone', 'theme', 'week_starts_on'];
    const fields = {};

    for (const key of allowedFields) {
        if (req.body[key] !== undefined) fields[key] = req.body[key];
    }

    if (Object.keys(fields).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update.' });
    }

    // Validate values before hitting the DB - bad values here would
    // silently corrupt settings that affect timezone and habit calculations.
    if (fields.theme !== undefined) {
        if (!fields.theme || typeof fields.theme !== 'string' || !VALID_THEMES.includes(fields.theme)) {
            return res.status(400).json({ error: `Invalid theme. Must be one of: ${VALID_THEMES.join(', ')}.` });
        }
    }
    if (fields.week_starts_on !== undefined && !VALID_WEEK_STARTS.includes(fields.week_starts_on)) {
        return res.status(400).json({ error: 'Invalid week_starts_on. Must be 0 (Sunday) or 1 (Monday).' });
    }
    if (fields.timezone !== undefined) {
        if (!fields.timezone || typeof fields.timezone !== 'string' || !VALID_TIMEZONES.has(fields.timezone)) {
            return res.status(400).json({ error: 'Invalid timezone. Must be a valid IANA timezone name (e.g. "Asia/Kolkata").' });
        }
    }

    try {
        const settings = await settingsService.updateSettings(req.profileId, fields);
        if (!settings) {
            return res.status(404).json({ error: 'Settings not found for this profile.' });
        }
        return res.status(200).json({ settings });
    } catch (err) {
        console.error('Update settings error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

module.exports = { getSettings, updateSettings };