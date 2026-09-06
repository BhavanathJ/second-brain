import { initLayout } from '../layout.js';
import { apiFetch } from '../api.js';
import { showToast } from '../toast.js';
import { confirmAction } from '../confirmDialog.js';
import { initProfileFilter } from '../profileFilter.js';

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

function formatDate(isoString, timeZone) {
    return new Date(isoString).toLocaleDateString('en-US', {
        timeZone, month: 'short', day: 'numeric', year: 'numeric',
    });
}

const TYPE_LABELS = {
    task: 'Task',
    note: 'Note',
    habit: 'Habit',
    reminder: 'Reminder',
    calendar_event: 'Event',
};

let timeZone = 'UTC';
let currentProfileFilter = null;
let profilesCache = [];

function renderProfileBadge(item) {
    const profileIds = [...new Set(profilesCache.map(p => p.id).filter(Boolean))];
    const showBadge = profileIds.length > 1 && item.profile_id;
    const profile = profilesCache.find(p => p.id === item.profile_id);
    if (!showBadge || !profile) return '';
    return `
        <span class="bin-badge" style="border-color: ${profile.color}; color: ${profile.color};">
            <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${profile.color};margin-right:0.3rem;"></span>
            ${escapeHtml(profile.name)}
        </span>
    `;
}

function renderBinItem(entry) {
    return `
    <div class="bin-item">
      <span class="bin-badge ${entry.entity_type}">${TYPE_LABELS[entry.entity_type] ?? entry.entity_type}</span>
      <div class="bin-item-body">
        <div class="bin-item-label">${escapeHtml(entry.label)}</div>
        <div class="bin-item-meta">
          Deleted ${formatDate(entry.deleted_at, timeZone)} · Auto-purges ${formatDate(entry.auto_purge_at, timeZone)}${renderProfileBadge(entry)}
        </div>
      </div>
      <div class="bin-item-actions">
        <button class="btn btn-outline-primary bin-restore-btn" data-id="${entry.id}">Restore</button>
        <button class="btn btn-outline-danger bin-delete-btn" data-id="${entry.id}">Delete Forever</button>
      </div>
    </div>
  `;
}

async function loadBin() {
    let url = '/bin';
    if (currentProfileFilter === 'all') {
        url += '?profile_ids=all';
    } else if (Array.isArray(currentProfileFilter) && currentProfileFilter.length > 0) {
        url += `?profile_ids=${currentProfileFilter.join(',')}`;
    }
    const { entries } = await apiFetch(url);
    const mount = document.getElementById('binList');
    mount.innerHTML = entries.length === 0
        ? '<div class="dash-empty">Bin is empty.</div>'
        : entries.map(renderBinItem).join('');
    wireEvents();
}

function wireEvents() {
    document.querySelectorAll('.bin-restore-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
                await apiFetch(`/bin/${btn.dataset.id}/restore`, { method: 'POST' });
                showToast('Restored', 'success');
                await loadBin();
            } catch (err) {
                // A 404 here specifically means the original item was already
                // hard-deleted elsewhere — the backend guard from earlier.
                showToast('Failed to restore: ' + err.message);
                btn.disabled = false;
            }
        });
    });

    document.querySelectorAll('.bin-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ok = await confirmAction('Permanently delete this item? This cannot be undone.');
            if (!ok) return;
            try {
                await apiFetch(`/bin/${btn.dataset.id}`, { method: 'DELETE' });
                showToast('Deleted permanently', 'success');
                await loadBin();
            } catch (err) {
                showToast('Failed to delete: ' + err.message);
            }
        });
    });
}

async function main() {
    const layoutInfo = await initLayout('bin');
    if (!layoutInfo) return;

    try {
        const { settings } = await apiFetch('/settings');
        timeZone = settings.timezone;
    } catch (err) {
        console.error('Failed to load settings, defaulting bin dates to UTC:', err);
    }

    // Initialize profile filter
    await initProfileFilter((profileIds) => {
        currentProfileFilter = profileIds;
        loadBin();
    });

    // Load profiles for badge rendering
    try {
        const { profiles } = await apiFetch('/profiles');
        profilesCache = profiles;
    } catch (err) {
        console.error('Failed to load profiles for badges:', err);
        profilesCache = [];
    }

    try {
        await loadBin();
    } catch (err) {
        console.error('Failed to load bin:', err);
        document.querySelector('.bin-page').insertAdjacentHTML('beforeend',
            `<div class="alert alert-danger">Failed to load bin: ${escapeHtml(err.message)}</div>`);
    }
}

main();