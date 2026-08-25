const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

async function listNotes(profileId, { tags } = {}) {
    let sql = 'SELECT * FROM notes WHERE profile_id = ? AND deleted_at IS NULL ORDER BY created_at DESC';
    const stmt = db.prepare(sql);
    const rows = stmt.all(profileId);

    const notes = rows.map(r => ({
        ...r,
        tags: typeof r.tags === 'string' ? JSON.parse(r.tags || '[]') : (r.tags || [])
    }));

    if (tags && tags.length > 0) {
        return notes.filter(n => tags.some(t => n.tags.includes(t)));
    }
    return notes;
}

async function getNoteById(profileId, noteId) {
    const stmt = db.prepare('SELECT * FROM notes WHERE profile_id = ? AND id = ? AND deleted_at IS NULL');
    const r = stmt.get(profileId, noteId);
    if (!r) return null;
    return {
        ...r,
        tags: typeof r.tags === 'string' ? JSON.parse(r.tags || '[]') : (r.tags || [])
    };
}

async function createNote(profileId, { content, tags }) {
    const id = uuidv4();
    const tagsJson = JSON.stringify(tags ?? []);
    const stmt = db.prepare(`
        INSERT INTO notes (id, profile_id, content, tags, converted_task_id, deleted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, NULL, NULL, datetime('now'), datetime('now'))
    `);
    stmt.run(id, profileId, content, tagsJson);
    return getNoteById(profileId, id);
}

async function updateNote(profileId, noteId, fields) {
    const current = await getNoteById(profileId, noteId);
    if (!current) return null;

    const content = fields.content !== undefined ? fields.content : current.content;
    const tagsJson = fields.tags !== undefined ? JSON.stringify(fields.tags) : JSON.stringify(current.tags);

    const stmt = db.prepare(`
        UPDATE notes
        SET content = ?, tags = ?, updated_at = datetime('now')
        WHERE profile_id = ? AND id = ? AND deleted_at IS NULL
    `);
    stmt.run(content, tagsJson, profileId, noteId);

    return getNoteById(profileId, noteId);
}

async function markNoteConverted(profileId, noteId, taskId) {
    const stmt = db.prepare(`
        UPDATE notes
        SET converted_task_id = ?, updated_at = datetime('now')
        WHERE profile_id = ? AND id = ? AND deleted_at IS NULL AND converted_task_id IS NULL
    `);
    const info = stmt.run(taskId, profileId, noteId);
    if (info.changes === 0) return null;
    return getNoteById(profileId, noteId);
}

async function softDeleteNote(profileId, noteId) {
    const stmt = db.prepare(`
        UPDATE notes
        SET deleted_at = datetime('now')
        WHERE profile_id = ? AND id = ? AND deleted_at IS NULL
    `);
    stmt.run(profileId, noteId);
    return { id: noteId };
}

async function restoreNote(profileId, noteId) {
    const stmt = db.prepare(`
        UPDATE notes
        SET deleted_at = NULL, updated_at = datetime('now')
        WHERE profile_id = ? AND id = ?
    `);
    stmt.run(profileId, noteId);
    return getNoteById(profileId, noteId);
}

async function hardDeleteNote(profileId, noteId) {
    const stmt = db.prepare('DELETE FROM notes WHERE profile_id = ? AND id = ?');
    stmt.run(profileId, noteId);
}

async function clearConvertedTaskId(profileId, taskId) {
    const stmt = db.prepare(`
        UPDATE notes
        SET converted_task_id = NULL, updated_at = datetime('now')
        WHERE profile_id = ? AND converted_task_id = ?
    `);
    stmt.run(profileId, taskId);
}

module.exports = {
    listNotes,
    getNoteById,
    createNote,
    updateNote,
    markNoteConverted,
    softDeleteNote,
    restoreNote,
    hardDeleteNote,
    clearConvertedTaskId,
};