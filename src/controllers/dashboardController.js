const dashboardService = require('../services/dashboardService');
const settingsService = require('../services/settingsService');
const { resolveProfileIds } = require('../utils/profileAccess');

async function getDashboard(req, res) {
    let profileIds;
    try {
        profileIds = await resolveProfileIds(req.userId, req.profileId, req.query.profile_ids);
    } catch (err) {
        return res.status(err.statusCode || 500).json({ error: err.message });
    }

    try {
        if (profileIds.length === 1 && profileIds[0] === req.profileId) {
            const settings = await settingsService.getSettings(req.profileId);
            const data = await dashboardService.getDashboardData(req.profileId, settings.timezone);
            return res.status(200).json(data);
        }

        const profileData = await Promise.all(
            profileIds.map(async (pid) => {
                const settings = await settingsService.getSettings(pid);
                const data = await dashboardService.getDashboardData(pid, settings.timezone);
                return { profileId: pid, data };
            })
        );

        const merged = {
            today: { tasks: [], habits: [], reminders: [], calendar_events: [] },
            tomorrow: { tasks: [], reminders: [], calendar_events: [] },
            next_7_days: { tasks: [], reminders: [], calendar_events: [] },
            overdue: { tasks: [] },
            no_deadline: { tasks: [] },
        };

        for (const { data } of profileData) {
            merged.today.tasks.push(...data.today.tasks);
            merged.today.habits.push(...data.today.habits);
            merged.today.reminders.push(...data.today.reminders);
            merged.today.calendar_events.push(...data.today.calendar_events);

            merged.tomorrow.tasks.push(...data.tomorrow.tasks);
            merged.tomorrow.reminders.push(...data.tomorrow.reminders);
            merged.tomorrow.calendar_events.push(...data.tomorrow.calendar_events);

            merged.next_7_days.tasks.push(...data.next_7_days.tasks);
            merged.next_7_days.reminders.push(...data.next_7_days.reminders);
            merged.next_7_days.calendar_events.push(...data.next_7_days.calendar_events);

            merged.overdue.tasks.push(...data.overdue.tasks);
            merged.no_deadline.tasks.push(...data.no_deadline.tasks);
        }

        return res.status(200).json(merged);
    } catch (err) {
        console.error('Dashboard error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

module.exports = { getDashboard };