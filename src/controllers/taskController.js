const taskService = require('../services/taskService');
const binService = require('../services/binService');
const noteService = require('../services/noteService');

function parseBoolParam(value) {
    if (value === undefined) return undefined;
    return value === 'true';
}

async function listTasks(req, res) {
    try {
        const { urgent, important, status } = req.query;
        const tasks = await taskService.listTasks(req.profileId, {
            urgent: parseBoolParam(urgent),
            important: parseBoolParam(important),
            status,
        });
        return res.status(200).json({ tasks });
    } catch (err) {
        console.error('List tasks error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function getTask(req, res) {
    try {
        const task = await taskService.getTaskById(req.profileId, req.params.id);
        if (!task) {
            return res.status(404).json({ error: 'Task not found.' });
        }
        return res.status(200).json({ task });
    } catch (err) {
        console.error('Get task error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function createTask(req, res) {
    // due_at now matches the update endpoint's field name (and the DB
    // column) - previously this was `dueAt` (camelCase) here while
    // updateTask used `due_at` (snake_case), same resource, two
    // different conventions depending on which endpoint you hit.
    const { title, description, urgent, important, due_at, status } = req.body;

    if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Title is required.' });
    }

    // Validate status if provided
    if (status !== undefined) {
        const validStatuses = ['pending', 'done'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}.` });
        }
    }

    try {
        const task = await taskService.createTask(req.profileId, {
            title: title.trim(),
            description,
            urgent,
            important,
            due_at,
            status,
        });
        return res.status(201).json({ task });
    } catch (err) {
        console.error('Create task error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function updateTask(req, res) {
    const allowedFields = ['title', 'description', 'status', 'urgent', 'important', 'due_at'];
    const fields = {};

    for (const key of allowedFields) {
        if (req.body[key] !== undefined) fields[key] = req.body[key];
    }

    if (Object.keys(fields).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update.' });
    }

    // Validate status if provided
    if (fields.status !== undefined) {
        const validStatuses = ['pending', 'done'];
        if (!validStatuses.includes(fields.status)) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}.` });
        }
    }

    try {
        const task = await taskService.updateTask(req.profileId, req.params.id, fields);
        if (!task) {
            return res.status(404).json({ error: 'Task not found.' });
        }
        return res.status(200).json({ task });
    } catch (err) {
        console.error('Update task error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function deleteTask(req, res) {
    try {
        const task = await taskService.softDeleteTask(req.profileId, req.params.id);
        if (!task) {
            return res.status(404).json({ error: 'Task not found.' });
        }

        await binService.logDeletion(req.profileId, 'task', task.id);

        // If this task was converted from a note, clear the converted_task_id on the note
        // so the note can be converted again
        await noteService.clearConvertedTaskId(req.profileId, task.id);

        return res.status(204).send();
    } catch (err) {
        console.error('Delete task error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

module.exports = { listTasks, getTask, createTask, updateTask, deleteTask };