const reminderService = require('../services/reminderService');
const binService = require('../services/binService');

const VALID_ENTITY_TYPES = ['task', 'note', 'habit', 'calendar_event'];

async function listReminders(req, res) {
    try {
        const isDone = req.query.is_done === undefined
            ? undefined
            : req.query.is_done === 'true';

        const reminders = await reminderService.listReminders(req.profileId, { isDone });
        return res.status(200).json({ reminders });
    } catch (err) {
        console.error('List reminders error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function getReminder(req, res) {
    try {
        const reminder = await reminderService.getReminderById(req.profileId, req.params.id);
        if (!reminder) {
            return res.status(404).json({ error: 'Reminder not found.' });
        }
        return res.status(200).json({ reminder });
    } catch (err) {
        console.error('Get reminder error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function createReminder(req, res) {
    const { title, remindAt, entityType, entityId } = req.body;

    if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Title is required.' });
    }
    if (!remindAt) {
        return res.status(400).json({ error: 'remind_at timestamp is required.' });
    }

    // entity_type and entity_id must come together — one without the other
    // makes no sense and would create an unresolvable link in the DB.
    if (entityType && !entityId) {
        return res.status(400).json({ error: 'entity_id is required when entity_type is set.' });
    }
    if (entityId && !entityType) {
        return res.status(400).json({ error: 'entity_type is required when entity_id is set.' });
    }
    if (entityType && !VALID_ENTITY_TYPES.includes(entityType)) {
        return res.status(400).json({
            error: `Invalid entity_type. Must be one of: ${VALID_ENTITY_TYPES.join(', ')}.`,
        });
    }

    try {
        const reminder = await reminderService.createReminder(req.profileId, {
            title: title.trim(),
            remindAt,
            entityType,
            entityId,
        });
        return res.status(201).json({ reminder });
    } catch (err) {
        console.error('Create reminder error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function updateReminder(req, res) {
    const allowedFields = ['title', 'remind_at', 'is_done', 'entity_type', 'entity_id'];
    const fields = {};

    for (const key of allowedFields) {
        if (req.body[key] !== undefined) fields[key] = req.body[key];
    }

    if (Object.keys(fields).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update.' });
    }

    try {
        const reminder = await reminderService.updateReminder(
            req.profileId,
            req.params.id,
            fields
        );
        if (!reminder) {
            return res.status(404).json({ error: 'Reminder not found.' });
        }
        return res.status(200).json({ reminder });
    } catch (err) {
        console.error('Update reminder error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function deleteReminder(req, res) {
    try {
        const reminder = await reminderService.softDeleteReminder(req.profileId, req.params.id);
        if (!reminder) {
            return res.status(404).json({ error: 'Reminder not found.' });
        }
        await binService.logDeletion(req.profileId, 'reminder', reminder.id);
        return res.status(204).send();
    } catch (err) {
        console.error('Delete reminder error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

module.exports = { listReminders, getReminder, createReminder, updateReminder, deleteReminder };