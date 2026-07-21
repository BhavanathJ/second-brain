const noteService = require('../services/noteService');
const taskService = require('../services/taskService');
const binService = require('../services/binService');

async function listNotes(req, res) {
    try {
        // Tags arrive as a comma-separated query string: ?tags=work,ideas
        // Split into an array, filter out empty strings from trailing commas.
        const tags = req.query.tags
            ? req.query.tags.split(',').map(t => t.trim()).filter(Boolean)
            : [];

        const notes = await noteService.listNotes(req.profileId, { tags });
        return res.status(200).json({ notes });
    } catch (err) {
        console.error('List notes error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function getNote(req, res) {
    try {
        const note = await noteService.getNoteById(req.profileId, req.params.id);
        if (!note) {
            return res.status(404).json({ error: 'Note not found.' });
        }
        return res.status(200).json({ note });
    } catch (err) {
        console.error('Get note error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function createNote(req, res) {
    const { content, tags } = req.body;

    if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Content is required.' });
    }

    try {
        const note = await noteService.createNote(req.profileId, {
            content: content.trim(),
            tags: Array.isArray(tags) ? tags : [],
        });
        return res.status(201).json({ note });
    } catch (err) {
        console.error('Create note error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function updateNote(req, res) {
    const allowedFields = ['content', 'tags'];
    const fields = {};

    for (const key of allowedFields) {
        if (req.body[key] !== undefined) fields[key] = req.body[key];
    }

    if (Object.keys(fields).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update.' });
    }

    try {
        const note = await noteService.updateNote(req.profileId, req.params.id, fields);
        if (!note) {
            return res.status(404).json({ error: 'Note not found.' });
        }
        return res.status(200).json({ note });
    } catch (err) {
        console.error('Update note error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function deleteNote(req, res) {
    try {
        const note = await noteService.softDeleteNote(req.profileId, req.params.id);
        if (!note) {
            return res.status(404).json({ error: 'Note not found.' });
        }
        await binService.logDeletion(req.profileId, 'note', note.id);
        return res.status(204).send();
    } catch (err) {
        console.error('Delete note error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

// Converts a note into a task. Two writes, in order:
// 1. Create the task from the note's content
// 2. Write the new task's id back onto the note (converted_task_id)
// If step 2 fails after step 1 succeeds, the task exists but the note
// won't show "converted" — a known limitation without DB transactions.
// Same tradeoff as task soft-delete + bin_entries dual-write.
async function convertNoteToTask(req, res) {
    try {
        const note = await noteService.getNoteById(req.profileId, req.params.id);
        if (!note) {
            return res.status(404).json({ error: 'Note not found.' });
        }

        if (note.converted_task_id) {
            return res.status(409).json({
                error: 'This note has already been converted to a task.',
                taskId: note.converted_task_id,
            });
        }

        // Use the note's content as the task title, trimmed to 200 chars
        // so it doesn't overflow — notes can be long, task titles shouldn't be.
        const task = await taskService.createTask(req.profileId, {
            title: note.content.slice(0, 200),
            description: note.content.length > 200 ? note.content : null,
            urgent: false,
            important: false,
        });

        const updatedNote = await noteService.markNoteConverted(
            req.profileId,
            note.id,
            task.id
        );

        return res.status(201).json({ task, note: updatedNote });
    } catch (err) {
        console.error('Convert note error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

module.exports = { listNotes, getNote, createNote, updateNote, deleteNote, convertNoteToTask };