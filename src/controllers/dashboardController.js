const dashboardService = require('../services/dashboardService');
const settingsService = require('../services/settingsService');

async function getDashboard(req, res) {
    try {
        const settings = await settingsService.getSettings(req.profileId);
        const data = await dashboardService.getDashboardData(req.profileId, settings.timezone);
        return res.status(200).json(data);
    } catch (err) {
        console.error('Dashboard error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

module.exports = { getDashboard };