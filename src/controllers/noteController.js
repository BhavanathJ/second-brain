const noteService = require('../services/noteService');
const taskService = require('../services/taskService');
const binService = require('../services/binService');
const { resolveProfileIds, verifyProfileOwnership } = require('../utils/profileAccess');

async function listNotes(req, res) {
    let profileIds;
    try {
        profileIds = await resolveProfileIds(req.userId, req.profileId, req.query.profile_ids);
    } catch (err) {
        return res.status(err.statusCode || 500).json({ error: err.message });
    }

    try {
        // Tags arrive as a comma-separated query string: ?tags=work,ideas
        // Split into an array, filter out empty strings from trailing commas.
        const tags = req.query.tags
            ? req.query.tags.split(',').map(t => t.trim()).filter(Boolean)
            : [];

        const notes = await noteService.listNotesForProfiles(profileIds, { tags });
        return res.status(200).json({ notes });
    } catch (err) {
        console.error('List notes error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function getNote(req, res) {
    try {
        const note = await noteService.getNoteByIdOnly(req.params.id);
        if (!note) {
            return res.status(404).json({ error: 'Note not found.' });
        }
        const owns = await verifyProfileOwnership(req.userId, note.profile_id);
        if (!owns) {
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

    // Optional: if profile_id is explicitly provided in body, verify ownership
    const targetProfileId = req.body.profile_id ?? req.profileId;
    if (req.body.profile_id !== undefined) {
        const owns = await verifyProfileOwnership(req.userId, targetProfileId);
        if (!owns) {
            return res.status(404).json({ error: 'Cannot create note: profile not owned by user.' });
        }
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
        const note = await noteService.getNoteByIdOnly(req.params.id);
        if (!note) {
            return res.status(404).json({ error: 'Note not found.' });
        }
        const owns = await verifyProfileOwnership(req.userId, note.profile_id);
        if (!owns) {
            return res.status(404).json({ error: 'Note not found.' });
        }
        const updated = await noteService.updateNote(note.profile_id, req.params.id, fields);
        return res.status(200).json({ note: updated });
    } catch (err) {
        console.error('Update note error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function deleteNote(req, res) {
    try {
        const note = await noteService.getNoteByIdOnly(req.params.id);
        if (!note) {
            return res.status(404).json({ error: 'Note not found.' });
        }
        const owns = await verifyProfileOwnership(req.userId, note.profile_id);
        if (!owns) {
            return res.status(404).json({ error: 'Note not found.' });
        }

        const deleted = await noteService.softDeleteNote(note.profile_id, req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Note not found.' });
        }
        await binService.logDeletion(note.profile_id, 'note', note.id);
        return res.status(204).send();
    } catch (err) {
        console.error('Delete note error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

// Converts a note into a task. Two writes, in order:
// 1. Create the task from the note's content
// 2. Write the new task's id back onto the note (converted_task_id) —
//    this write is conditional (WHERE converted_task_id IS NULL), so if
//    a concurrent request already converted this note between our check
//    and now, this write fails cleanly instead of silently overwriting it.
async function convertNoteToTask(req, res) {
    try {
        const note = await noteService.getNoteByIdOnly(req.params.id);
        if (!note) {
            return res.status(404).json({ error: 'Note not found.' });
        }
        const owns = await verifyProfileOwnership(req.userId, note.profile_id);
        if (!owns) {
            return res.status(404).json({ error: 'Note not found.' });
        }

        if (note.converted_task_id) {
            return res.status(409).json({
                error: 'This note has already been converted to a task.',
                taskId: note.converted_task_id,
            });
        }

        // Use the user-provided title from the form, or fall back to first 200 chars of content
        const title = (req.body.title && req.body.title.trim()) ? req.body.title.trim() : note.content.slice(0, 200);
        // Use user-provided description if provided, otherwise use full note content
        const description = (req.body.description && req.body.description.trim()) ? req.body.description.trim() : note.content;
        const urgent = Boolean(req.body.urgent);
        const important = Boolean(req.body.important);
        const due_at = req.body.due_at ? new Date(req.body.due_at) : null;

        // Create the task under the NOTE's own profile_id (not req.profileId)
        const task = await taskService.createTask(note.profile_id, {
            title,
            description,
            urgent,
            important,
            due_at,
        });

        const updatedNote = await noteService.markNoteConverted(
            note.profile_id,
            note.id,
            task.id
        );

        if (!updatedNote) {
            // Lost the race — someone else converted this note between our
            // check above and this write. Clean up the orphan task we just
            // created rather than leaving a duplicate, untethered task behind.
            await taskService.hardDeleteTask(note.profile_id, task.id);

            const currentNote = await noteService.getNoteById(note.profile_id, note.id);
            return res.status(409).json({
                error: 'This note has already been converted to a task.',
                taskId: currentNote?.converted_task_id ?? null,
            });
        }

        return res.status(201).json({ task, note: updatedNote });
    } catch (err) {
        console.error('Convert note error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

module.exports = { listNotes, getNote, createNote, updateNote, deleteNote, convertNoteToTask };