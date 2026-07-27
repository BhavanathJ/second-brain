const calendarService = require('../services/calendarService');

async function getCalendarData(req, res) {
    const { start, end } = req.query;

    if (!start || !end) {
        return res.status(400).json({
            error: 'start and end query params are required (YYYY-MM-DD or ISO timestamp).',
        });
    }

    // Prevent absurdly large date ranges that would return the entire
    // database — cap at 90 days (covers a 3-month calendar view max).
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format for start or end.' });
    }
    if (endDate < startDate) {
        return res.status(400).json({ error: 'end must be after start.' });
    }

    const diffDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
    if (diffDays > 90) {
        return res.status(400).json({ error: 'Date range cannot exceed 90 days.' });
    }

    try {
        const data = await calendarService.getCalendarData(req.profileId, start, end);
        return res.status(200).json(data);
    } catch (err) {
        console.error('Get calendar data error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

module.exports = { getCalendarData };