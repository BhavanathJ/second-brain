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
    // remind_at/entity_type/entity_id now match updateReminder's field
    // names — previously camelCase here (remindAt/entityType/entityId)
    // while update used snake_case, and this endpoint would actively
    // reject the "correct" snake_case name instead of just ignoring it.
    const { title, remind_at, entity_type, entity_id } = req.body;

    if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Title is required.' });
    }
    if (!remind_at) {
        return res.status(400).json({ error: 'remind_at timestamp is required.' });
    }

    if (entity_type && !entity_id) {
        return res.status(400).json({ error: 'entity_id is required when entity_type is set.' });
    }
    if (entity_id && !entity_type) {
        return res.status(400).json({ error: 'entity_type is required when entity_id is set.' });
    }
    if (entity_type && !VALID_ENTITY_TYPES.includes(entity_type)) {
        return res.status(400).json({
            error: `Invalid entity_type. Must be one of: ${VALID_ENTITY_TYPES.join(', ')}.`,
        });
    }

    try {
        const reminder = await reminderService.createReminder(req.profileId, {
            title: title.trim(),
            remind_at,
            entity_type,
            entity_id,
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

    // Unlink consistency: clearing only ONE half of a link would leave the
    // other half dangling (e.g. PATCH { entity_type: null } on a task-linked
    // reminder would null the type but orphan the old entity_id). If either
    // half is explicitly cleared and the other wasn't sent, clear both.
    if (fields.entity_type === null && fields.entity_id === undefined) {
        fields.entity_id = null;
    }
    if (fields.entity_id === null && fields.entity_type === undefined) {
        fields.entity_type = null;
    }

    // Same entity_type/entity_id rules as createReminder — keeps create and
    // update consistent, so a PATCH can't orphan a reminder by setting an
    // unbalanced or invalid entity link. An explicit { entity_type: null,
    // entity_id: null } is allowed and unlinks the reminder.
    if (fields.entity_type && !fields.entity_id) {
        return res.status(400).json({ error: 'entity_id is required when entity_type is set.' });
    }
    if (fields.entity_id && !fields.entity_type) {
        return res.status(400).json({ error: 'entity_type is required when entity_id is set.' });
    }
    if (fields.entity_type && !VALID_ENTITY_TYPES.includes(fields.entity_type)) {
        return res.status(400).json({
            error: `Invalid entity_type. Must be one of: ${VALID_ENTITY_TYPES.join(', ')}.`,
        });
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