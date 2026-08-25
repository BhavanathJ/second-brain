const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const ENTITY_LABEL_CONFIG = {
    task: { table: 'tasks', column: 'title' },
    note: { table: 'notes', column: 'content' },
    habit: { table: 'habits', column: 'title' },
    reminder: { table: 'reminders', column: 'title' },
    calendar_event: { table: 'calendar_events', column: 'title' },
};

async function logDeletion(profileId, entityType, entityId) {
    const id = uuidv4();
    const autoPurgeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const stmt = db.prepare(`
        INSERT INTO bin_entries (id, profile_id, entity_type, entity_id, deleted_at, auto_purge_at)
        VALUES (?, ?, ?, ?, datetime('now'), ?)
    `);
    stmt.run(id, profileId, entityType, entityId, autoPurgeAt);
}

async function listBinEntries(profileId) {
    const stmt = db.prepare('SELECT * FROM bin_entries WHERE profile_id = ? ORDER BY deleted_at DESC');
    const data = stmt.all(profileId);

    const grouped = {};
    for (const entry of data) {
        if (!grouped[entry.entity_type]) grouped[entry.entity_type] = [];
        grouped[entry.entity_type].push(entry.entity_id);
    }

    const labelMap = {};

    for (const [entityType, ids] of Object.entries(grouped)) {
        const config = ENTITY_LABEL_CONFIG[entityType];
        if (!config || ids.length === 0) continue;

        const placeholders = ids.map(() => '?').join(',');
        const queryStmt = db.prepare(`SELECT id, ${config.column} as label FROM ${config.table} WHERE id IN (${placeholders})`);
        const rows = queryStmt.all(...ids);
        rows.forEach(row => {
            labelMap[row.id] = row.label;
        });
    }

    return data.map(entry => ({
        ...entry,
        label: (labelMap[entry.entity_id] ?? '(content unavailable)').slice(0, 100),
    }));
}

async function getBinEntryById(profileId, binEntryId) {
    const stmt = db.prepare('SELECT * FROM bin_entries WHERE profile_id = ? AND id = ?');
    return stmt.get(profileId, binEntryId) || null;
}

async function removeBinEntry(profileId, binEntryId) {
    const stmt = db.prepare('DELETE FROM bin_entries WHERE profile_id = ? AND id = ?');
    stmt.run(profileId, binEntryId);
}

async function getExpiredBinEntries() {
    const nowISO = new Date().toISOString();
    const stmt = db.prepare('SELECT * FROM bin_entries WHERE auto_purge_at <= ?');
    return stmt.all(nowISO);
}

module.exports = {
    logDeletion,
    listBinEntries,
    getBinEntryById,
    removeBinEntry,
    getExpiredBinEntries,
};