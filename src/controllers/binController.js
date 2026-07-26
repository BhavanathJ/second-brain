const binService = require('../services/binService');
const taskService = require('../services/taskService');
const noteService = require('../services/noteService');
const reminderService = require('../services/reminderService');

// Option B restore map — add one line here whenever a new feature is built.
// entity_type value → { restore, hardDelete } functions from its service.
const entityHandlers = {
    task: {
        restore: taskService.restoreTask,
        hardDelete: taskService.hardDeleteTask,
    },
    note: {
        restore: noteService.restoreNote,
        hardDelete: noteService.hardDeleteNote,
    },
    reminder: {
        restore: reminderService.restoreReminder,
        hardDelete: reminderService.hardDeleteReminder,
    },
    // habit and calendar_event get added here once those modules are built
};

async function listBin(req, res) {
    try {
        const entries = await binService.listBinEntries(req.profileId);
        return res.status(200).json({ entries });
    } catch (err) {
        console.error('List bin error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function restoreEntry(req, res) {
    try {
        const entry = await binService.getBinEntryById(req.profileId, req.params.id);
        if (!entry) {
            return res.status(404).json({ error: 'Bin entry not found.' });
        }

        const handler = entityHandlers[entry.entity_type];
        if (!handler) {
            return res.status(400).json({ error: `Cannot restore entity_type: ${entry.entity_type}` });
        }

        // Restore the source row (clears deleted_at), then remove from bin.
        await handler.restore(req.profileId, entry.entity_id);
        await binService.removeBinEntry(req.profileId, entry.id);

        return res.status(200).json({ message: 'Restored successfully.', entityType: entry.entity_type });
    } catch (err) {
        console.error('Restore error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function permanentDelete(req, res) {
    try {
        const entry = await binService.getBinEntryById(req.profileId, req.params.id);
        if (!entry) {
            return res.status(404).json({ error: 'Bin entry not found.' });
        }

        const handler = entityHandlers[entry.entity_type];
        if (!handler) {
            return res.status(400).json({ error: `Cannot delete entity_type: ${entry.entity_type}` });
        }

        // Hard-delete the source row first, then remove from bin.
        await handler.hardDelete(req.profileId, entry.entity_id);
        await binService.removeBinEntry(req.profileId, entry.id);

        return res.status(204).send();
    } catch (err) {
        console.error('Permanent delete error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

// Called by the cron job — not an HTTP endpoint.
// Finds all expired bin entries and hard-deletes their source rows + bin entry.
async function purgeExpiredEntries() {
    const expired = await binService.getExpiredBinEntries();

    for (const entry of expired) {
        const handler = entityHandlers[entry.entity_type];
        if (!handler) {
            console.warn(`[cron] No handler for entity_type: ${entry.entity_type}, skipping.`);
            continue;
        }
        try {
            await handler.hardDelete(entry.profile_id, entry.entity_id);
            await binService.removeBinEntry(entry.profile_id, entry.id);
            console.log(`[cron] Purged ${entry.entity_type} ${entry.entity_id}`);
        } catch (err) {
            console.error(`[cron] Failed to purge ${entry.entity_type} ${entry.entity_id}:`, err);
        }
    }
}

module.exports = { listBin, restoreEntry, permanentDelete, purgeExpiredEntries };