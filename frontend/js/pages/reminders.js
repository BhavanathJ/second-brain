import { initLayout, getCachedSettings, fetchSettingsFast } from '../layout.js';
import { apiFetch } from '../api.js';
import { showToast } from '../toast.js';
import { confirmAction } from '../confirmDialog.js';

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

function renderSkeletons(count = 2) {
    return Array.from({ length: count }, () => `
        <div class="reminder-item sb-skeleton sb-skeleton-card">
            <div style="flex:1;">
                <div class="sb-skeleton-line w-80"></div>
                <div class="sb-skeleton-line w-40"></div>
            </div>
        </div>
    `).join('');
}

function showLoadingSkeletons() {
    const pendingList = document.getElementById('pendingList');
    const doneList = document.getElementById('doneList');
    if (pendingList) pendingList.innerHTML = renderSkeletons(2);
    if (doneList) doneList.innerHTML = renderSkeletons(2);
}

function formatDateTime(isoString, timeZone) {
    return new Date(isoString).toLocaleString('en-US', {
        timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
}

function isoToLocalInput(isoString) {
    if (!isoString) return '';
    return isoString.slice(0, 16);
}

let timeZone = getCachedSettings().timezone || 'UTC';
let allReminders = [];
let modal = null;

function renderReminderItem(r) {
    return `
    <div class="reminder-item${r.is_done ? ' done' : ''}">
      <div class="reminder-body">
        <div class="reminder-title">${escapeHtml(r.title)}</div>
        <div class="reminder-time">${formatDateTime(r.remind_at, timeZone)}</div>
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

    const pendingEl = document.getElementById('pendingList');
    const doneEl = document.getElementById('doneList');

    if (pendingEl) {
        pendingEl.innerHTML = pending.length === 0
            ? '<div class="dash-empty">Nothing pending.</div>'
            : pending.map(renderReminderItem).join('');
    }

    if (doneEl) {
        doneEl.innerHTML = done.length === 0
            ? '<div class="dash-empty">Nothing done yet.</div>'
            : done.map(renderReminderItem).join('');
    }

    wireItemEvents();
}

async function loadReminders() {
    const { reminders } = await apiFetch('/reminders');
    allReminders = reminders;
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
            const ok = await confirmAction('Move this reminder to the bin?');
            if (!ok) return;
            try {
                await apiFetch(`/reminders/${btn.dataset.id}`, { method: 'DELETE' });
                showToast('Reminder moved to bin', 'success');
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
    showLoadingSkeletons();

    const layoutPromise = initLayout('reminders');
    const settingsPromise = fetchSettingsFast();
    const remindersPromise = loadReminders();

    const modalEl = document.getElementById('reminderModal');
    modal = new bootstrap.Modal(modalEl);

    document.getElementById('addReminderBtn').addEventListener('click', () => openModal(null));
    document.getElementById('reminderForm').addEventListener('submit', handleSubmit);

    try {
        const [layoutInfo, freshSettings] = await Promise.all([
            layoutPromise,
            settingsPromise,
            remindersPromise
        ]);
        if (!layoutInfo) return;

        if (freshSettings?.timezone && freshSettings.timezone !== timeZone) {
            timeZone = freshSettings.timezone;
            render();
        }
    } catch (err) {
        console.error('Failed to load reminders:', err);
        document.querySelector('.reminders-page').insertAdjacentHTML('beforeend',
            `<div class="alert alert-danger">Failed to load reminders: ${escapeHtml(err.message)}</div>`);
    }
}

main();