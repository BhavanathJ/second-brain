const dashboardService = require('../services/dashboardService');

async function getDashboard(req, res) {
    try {
        const data = await dashboardService.getDashboardData(req.profileId);
        return res.status(200).json(data);
    } catch (err) {
        console.error('Dashboard error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

module.exports = { getDashboard };