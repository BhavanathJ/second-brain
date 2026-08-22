const calendarEventService = require('../services/calendarEventService');
const binService = require('../services/binService');

async function listCalendarEvents(req, res) {
    try {
        const { start, end } = req.query;
        const events = await calendarEventService.listCalendarEvents(req.profileId, { start, end });
        return res.status(200).json({ events });
    } catch (err) {
        console.error('List calendar events error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function getCalendarEvent(req, res) {
    try {
        const event = await calendarEventService.getCalendarEventById(req.profileId, req.params.id);
        if (!event) {
            return res.status(404).json({ error: 'Calendar event not found.' });
        }
        return res.status(200).json({ event });
    } catch (err) {
        console.error('Get calendar event error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function createCalendarEvent(req, res) {
    const { title, starts_at, ends_at, location } = req.body;

    if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Title is required.' });
    }
    if (!starts_at) {
        return res.status(400).json({ error: 'starts_at timestamp is required.' });
    }
    if (ends_at && new Date(ends_at) <= new Date(starts_at)) {
        return res.status(400).json({ error: 'ends_at must be after starts_at.' });
    }

    try {
        const event = await calendarEventService.createCalendarEvent(req.profileId, {
            title: title.trim(),
            starts_at,
            ends_at,
            location,
        });
        return res.status(201).json({ event });
    } catch (err) {
        console.error('Create calendar event error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function updateCalendarEvent(req, res) {
    const allowedFields = ['title', 'starts_at', 'ends_at', 'location'];
    const fields = {};

    for (const key of allowedFields) {
        if (req.body[key] !== undefined) fields[key] = req.body[key];
    }

    if (Object.keys(fields).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update.' });
    }

    // Validate that ends_at is after starts_at if both are provided
    // Need to check against existing values if only one is being updated
    if (fields.starts_at || fields.ends_at) {
        try {
            const existingEvent = await calendarEventService.getCalendarEventById(req.profileId, req.params.id);
            if (!existingEvent) {
                return res.status(404).json({ error: 'Calendar event not found.' });
            }
            const startsAt = fields.starts_at ?? existingEvent.starts_at;
            const endsAt = fields.ends_at ?? existingEvent.ends_at;
            if (endsAt && new Date(endsAt) <= new Date(startsAt)) {
                return res.status(400).json({ error: 'ends_at must be after starts_at.' });
            }
        } catch (err) {
            console.error('Update calendar event validation error:', err);
            return res.status(500).json({ error: 'Something went wrong. Please try again.' });
        }
    }

    try {
        const event = await calendarEventService.updateCalendarEvent(
            req.profileId,
            req.params.id,
            fields
        );
        if (!event) {
            return res.status(404).json({ error: 'Calendar event not found.' });
        }
        return res.status(200).json({ event });
    } catch (err) {
        console.error('Update calendar event error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function deleteCalendarEvent(req, res) {
    try {
        const event = await calendarEventService.softDeleteCalendarEvent(
            req.profileId,
            req.params.id
        );
        if (!event) {
            return res.status(404).json({ error: 'Calendar event not found.' });
        }
        await binService.logDeletion(req.profileId, 'calendar_event', event.id);
        return res.status(204).send();
    } catch (err) {
        console.error('Delete calendar event error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

module.exports = {
    listCalendarEvents,
    getCalendarEvent,
    createCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
};