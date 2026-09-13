import { initLayout } from '../layout.js';
import { apiFetch } from '../api.js';
import { showToast } from '../toast.js';
import { confirmAction } from '../confirmDialog.js';
import { initProfileFilter } from '../profileFilter.js';
import { formatDateTimeWithTZ } from '../timeUtils.js';
import { escapeHtml, renderProfileBadge as renderBadgeMarkup } from '../utils.js';

function isoToLocalInput(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let timeZone = 'UTC';
let allReminders = [];
const modalEl = document.getElementById('reminderModal');
const modal = new bootstrap.Modal(modalEl);
let currentProfileFilter = null;
let profilesCache = [];

function renderProfileBadge(item) {
    const profileIds = [...new Set(allReminders.map(r => r.profile_id).filter(Boolean))];
    const showBadge = profileIds.length > 1 && item.profile_id;
    if (!showBadge) return '';
    return renderBadgeMarkup(profilesCache.find(p => p.id === item.profile_id));
}

function renderReminderItem(r) {
    return `
    <div class="reminder-item${r.is_done ? ' done' : ''}">
      <div class="reminder-body">
        <div class="reminder-title">${escapeHtml(r.title)}${renderProfileBadge(r)}</div>
        <div class="reminder-time">${formatDateTimeWithTZ(r.remind_at, timeZone, r.profile_timezone)}</div>
      </div>
      <div class="reminder-actions">
        <button class="btn ${r.is_done ? 'btn-outline-secondary' : 'btn-outline-primary'} reminder-toggle-btn" data-id="${r.id}" data-done="${r.is_done}">
          ${r.is_done ? 'Reopen' : 'Mark Done'}
        </button>
        <button class="btn btn-outline-secondary reminder-edit-btn" data-id="${r.id}">Edit</button>
        <button class="btn btn-outline-danger reminder-delete-btn" data-id="${r.id}">Delete</button>
      </div>
    </div>
  `;
}

function render() {
    const pending = allReminders.filter(r => !r.is_done);
    const done = allReminders.filter(r => r.is_done);

    document.getElementById('pendingList').innerHTML = pending.length === 0
        ? '<div class="dash-empty">Nothing pending.</div>'
        : pending.map(renderReminderItem).join('');

    document.getElementById('doneList').innerHTML = done.length === 0
        ? '<div class="dash-empty">Nothing done yet.</div>'
        : done.map(renderReminderItem).join('');

    wireItemEvents();
}

async function loadReminders() {
    let url = '/reminders';
    if (currentProfileFilter === 'all') {
        url += '?profile_ids=all';
    } else if (Array.isArray(currentProfileFilter) && currentProfileFilter.length > 0) {
        url += `?profile_ids=${currentProfileFilter.join(',')}`;
    }

    const { reminders } = await apiFetch(url);
    allReminders = reminders;

    // Cache profiles for badge rendering
    const profileIds = [...new Set(reminders.map(r => r.profile_id).filter(Boolean))];
    if (profileIds.length > 0) {
        try {
            const { profiles } = await apiFetch('/profiles');
            profilesCache = profiles;
        } catch (err) {
            console.error('Failed to load profiles for badges:', err);
            profilesCache = [];
        }
    }

    render();
}

function wireItemEvents() {
    document.querySelectorAll('.reminder-toggle-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            const currentlyDone = btn.dataset.done === 'true';
            try {
                await apiFetch(`/reminders/${btn.dataset.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ is_done: !currentlyDone }),
                });
                await loadReminders();
            } catch (err) {
                showToast('Failed to update reminder: ' + err.message);
                btn.disabled = false;
            }
        });
    });

    document.querySelectorAll('.reminder-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => openModal(btn.dataset.id));
    });

    document.querySelectorAll('.reminder-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ok = await confirmAction('Move this reminder to Bin?');
            if (!ok) return;
            try {
                await apiFetch(`/reminders/${btn.dataset.id}`, { method: 'DELETE' });
                showToast('Reminder moved to Bin', 'success');
                await loadReminders();
            } catch (err) {
                showToast('Failed to delete reminder: ' + err.message);
            }
        });
    });
}

function openModal(reminderId) {
    const form = document.getElementById('reminderForm');
    form.reset();
    document.getElementById('reminderId').value = '';

    if (reminderId) {
        const reminder = allReminders.find(r => r.id === reminderId);
        if (!reminder) return;
        document.getElementById('reminderModalTitle').textContent = 'Edit Reminder';
        document.getElementById('reminderId').value = reminder.id;
        document.getElementById('reminderTitle').value = reminder.title;
        document.getElementById('reminderRemindAt').value = isoToLocalInput(reminder.remind_at);
    } else {
        document.getElementById('reminderModalTitle').textContent = 'Add Reminder';
    }

    modal.show();
}

async function handleSubmit(e) {
    e.preventDefault();
    const reminderId = document.getElementById('reminderId').value;
    const payload = {
        title: document.getElementById('reminderTitle').value.trim(),
        remind_at: new Date(document.getElementById('reminderRemindAt').value).toISOString(),
    };

    try {
        if (reminderId) {
            await apiFetch(`/reminders/${reminderId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        } else {
            await apiFetch('/reminders', { method: 'POST', body: JSON.stringify(payload) });
        }
        modal.hide();
        showToast('Reminder saved', 'success');
        await loadReminders();
    } catch (err) {
        showToast('Failed to save reminder: ' + err.message);
    }
}

async function main() {
    const layoutInfo = await initLayout('reminders');
    if (!layoutInfo) return;

    try {
        const { settings } = await apiFetch('/settings');
        timeZone = settings.timezone;
    } catch (err) {
        console.error('Failed to load settings, defaulting reminder times to UTC:', err);
    }

    // Initialize profile filter
    await initProfileFilter((profileIds) => {
        currentProfileFilter = profileIds;
        loadReminders();
    });

    document.getElementById('addReminderBtn').addEventListener('click', () => openModal(null));
    document.getElementById('reminderForm').addEventListener('submit', handleSubmit);

    try {
        await loadReminders();
    } catch (err) {
        console.error('Failed to load reminders:', err);
        document.querySelector('.reminders-page').insertAdjacentHTML('beforeend',
            `<div class="alert alert-danger">Failed to load reminders: ${escapeHtml(err.message)}</div>`);
    }
}

main();