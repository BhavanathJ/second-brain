const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

async function listTasks(profileId, { urgent, important, status } = {}) {
    let sql = 'SELECT * FROM tasks WHERE profile_id = ? AND deleted_at IS NULL';
    const params = [profileId];

    if (urgent !== undefined) {
        sql += ' AND urgent = ?';
        params.push(urgent ? 1 : 0);
    }
    if (important !== undefined) {
        sql += ' AND important = ?';
        params.push(important ? 1 : 0);
    }
    if (status !== undefined) {
        sql += ' AND status = ?';
        params.push(status);
    }

    sql += ' ORDER BY created_at DESC';
    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    return rows.map(r => ({
        ...r,
        urgent: Boolean(r.urgent),
        important: Boolean(r.important),
    }));
}

async function getTaskById(profileId, taskId) {
    const stmt = db.prepare('SELECT * FROM tasks WHERE profile_id = ? AND id = ? AND deleted_at IS NULL');
    const r = stmt.get(profileId, taskId);
    if (!r) return null;
    return {
        ...r,
        urgent: Boolean(r.urgent),
        important: Boolean(r.important),
    };
}

async function createTask(profileId, { title, description, urgent, important, due_at, status }) {
    const id = uuidv4();
    const stmt = db.prepare(`
        INSERT INTO tasks (id, profile_id, title, description, status, urgent, important, due_at, deleted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'), datetime('now'))
    `);
    stmt.run(
        id,
        profileId,
        title,
        description ?? null,
        status ?? 'pending',
        urgent ? 1 : 0,
        important ? 1 : 0,
        due_at ?? null
    );
    return getTaskById(profileId, id);
}

async function updateTask(profileId, taskId, fields) {
    const current = await getTaskById(profileId, taskId);
    if (!current) return null;

    const title = fields.title !== undefined ? fields.title : current.title;
    const description = fields.description !== undefined ? fields.description : current.description;
    const status = fields.status !== undefined ? fields.status : current.status;
    const urgent = fields.urgent !== undefined ? (fields.urgent ? 1 : 0) : (current.urgent ? 1 : 0);
    const important = fields.important !== undefined ? (fields.important ? 1 : 0) : (current.important ? 1 : 0);
    const due_at = fields.due_at !== undefined ? fields.due_at : current.due_at;

    const stmt = db.prepare(`
        UPDATE tasks
        SET title = ?, description = ?, status = ?, urgent = ?, important = ?, due_at = ?, updated_at = datetime('now')
        WHERE profile_id = ? AND id = ? AND deleted_at IS NULL
    `);
    stmt.run(title, description, status, urgent, important, due_at, profileId, taskId);

    return getTaskById(profileId, taskId);
}

async function softDeleteTask(profileId, taskId) {
    const stmt = db.prepare(`
        UPDATE tasks
        SET deleted_at = datetime('now')
        WHERE profile_id = ? AND id = ? AND deleted_at IS NULL
    `);
    stmt.run(profileId, taskId);
    return { id: taskId };
}

async function restoreTask(profileId, taskId) {
    const stmt = db.prepare(`
        UPDATE tasks
        SET deleted_at = NULL, updated_at = datetime('now')
        WHERE profile_id = ? AND id = ?
    `);
    stmt.run(profileId, taskId);
    return getTaskById(profileId, taskId);
}

async function hardDeleteTask(profileId, taskId) {
    const stmt = db.prepare('DELETE FROM tasks WHERE profile_id = ? AND id = ?');
    stmt.run(profileId, taskId);
}

module.exports = {
    listTasks,
    getTaskById,
    createTask,
    updateTask,
    softDeleteTask,
    restoreTask,
    hardDeleteTask,
};