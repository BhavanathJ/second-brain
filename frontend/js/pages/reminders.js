import { initLayout } from '../layout.js';
import { apiFetch } from '../api.js';

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

function formatDateTime(isoString, timeZone) {
    return new Date(isoString).toLocaleString('en-US', {
        timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
}

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

    document.getElementById('pendingList').innerHTML = pending.length === 0
        ? '<div class="dash-empty">Nothing pending.</div>'
        : pending.map(renderReminderItem).join('');

    document.getElementById('doneList').innerHTML = done.length === 0
        ? '<div class="dash-empty">Nothing done yet.</div>'
        : done.map(renderReminderItem).join('');

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
                alert('Failed to update reminder: ' + err.message);
                btn.disabled = false;
            }
        });
    });

    document.querySelectorAll('.reminder-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => openModal(btn.dataset.id));
    });

    document.querySelectorAll('.reminder-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Move this reminder to Bin?')) return;
            try {
                await apiFetch(`/reminders/${btn.dataset.id}`, { method: 'DELETE' });
                await loadReminders();
            } catch (err) {
                alert('Failed to delete reminder: ' + err.message);
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
        await loadReminders();
    } catch (err) {
        alert('Failed to save reminder: ' + err.message);
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