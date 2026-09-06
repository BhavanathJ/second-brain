import { initLayout } from '../layout.js';
import { apiFetch } from '../api.js';
import { initProfileFilter } from '../profileFilter.js';
import { confirmAction } from '../confirmDialog.js';
import { showToast } from '../toast.js';

// Basic HTML-escaping for any user-supplied text (task titles, note
// content, etc.) before it goes into innerHTML — without this, a task
// titled "<img src=x onerror=alert(1)>" would execute as real HTML.
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

function formatTime(isoString, timeZone) {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString('en-US', {
        timeZone,
        hour: 'numeric',
        minute: '2-digit',
    });
}

function formatDate(isoString, timeZone) {
    if (!isoString) return '';
    return new Date(isoString).toLocaleDateString('en-US', {
        timeZone,
        month: 'short',
        day: 'numeric',
    });
}

function formatTimeWithTZ(isoString, timeZone, itemTimeZone) {
    const base = formatTime(isoString, timeZone);
    if (!itemTimeZone || itemTimeZone === timeZone) return base;
    return `${base} (${itemTimeZone})`;
}

function formatDateWithTZ(isoString, timeZone, itemTimeZone) {
    const base = formatDate(isoString, timeZone);
    if (!itemTimeZone || itemTimeZone === timeZone) return base;
    return `${base} (${itemTimeZone})`;
}

function renderEmpty(label) {
    return `<div class="dash-empty">No ${label} — nice.</div>`;
}

// Stable sort: items marked done come LAST, preserving their relative order otherwise
function sortByDone(items, isDoneFn) {
    return [...items].sort((a, b) => (isDoneFn(a) ? 1 : 0) - (isDoneFn(b) ? 1 : 0));
}

function renderTasks(tasks, timeZone) {
    const sorted = sortByDone(tasks, t => t.status === 'done');
    if (sorted.length === 0) return renderEmpty('tasks');
    return sorted.map(t => {
        const isDone = t.status === 'done';
        return `
        <div class="dash-item">
          <input type="checkbox" class="form-check-input task-done-checkbox" data-id="${t.id}" ${isDone ? 'checked' : ''} />
          <span class="dash-item-title${isDone ? ' dash-habit-done' : ''}">${escapeHtml(t.title)}${renderProfileBadge(t)}</span>
          ${t.due_at ? `<span class="dash-item-time">${formatTimeWithTZ(t.due_at, timeZone, t.profile_timezone)}</span>` : ''}
          <button class="btn btn-outline-danger btn-sm task-delete-btn" data-id="${t.id}">Delete</button>
        </div>
      `;
    }).join('');
}

function renderReminders(reminders, timeZone) {
    const sorted = sortByDone(reminders, r => !!r.is_done);
    if (sorted.length === 0) return renderEmpty('reminders');
    return sorted.map(r => {
        const isDone = !!r.is_done;
        return `
        <div class="dash-item">
          <input type="checkbox" class="form-check-input reminder-done-checkbox" data-id="${r.id}" ${isDone ? 'checked' : ''} />
          <span class="dash-item-title${isDone ? ' dash-habit-done' : ''}">${escapeHtml(r.title)}${renderProfileBadge(r)}</span>
          <span class="dash-item-time">${formatTimeWithTZ(r.remind_at, timeZone, r.profile_timezone)}</span>
          <button class="btn btn-outline-danger btn-sm reminder-delete-btn" data-id="${r.id}">Delete</button>
        </div>
      `;
    }).join('');
}

function renderEvents(events, timeZone) {
    if (events.length === 0) return renderEmpty('events');
    return events.map(e => `
    <div class="dash-item">
      <span class="dash-item-title">${escapeHtml(e.title)}${renderProfileBadge(e)}</span>
      <span class="dash-item-time">${formatTimeWithTZ(e.starts_at, timeZone, e.profile_timezone)}</span>
      <button class="btn btn-outline-danger btn-sm event-delete-btn" data-id="${e.id}">Delete</button>
    </div>
  `).join('');
}

// Habits with completed_today=true get an "Undo" button using
// today_date — the exact local date string the SERVER computed and
// returned alongside completed_today. Never guessed client-side.
function renderHabits(habits) {
    if (habits.length === 0) return renderEmpty('habits');
    return habits.map(h => `
    <div class="dash-item">
      <span class="dash-item-title${h.completed_today ? ' dash-habit-done' : ''}">${escapeHtml(h.title)}${renderProfileBadge(h)}</span>
      ${h.completed_today
            ? `<button class="btn btn-sm btn-outline-secondary habit-undo-btn" data-habit-id="${h.id}" data-log-date="${h.today_date}">Undo</button>`
            : `<button class="btn btn-sm btn-outline-primary habit-done-btn" data-habit-id="${h.id}">Mark done</button>`
        }
    </div>
  `).join('');
}

function renderOverdue(tasks, timeZone) {
    const section = document.getElementById('overdueSection');
    const sorted = sortByDone(tasks, t => t.status === 'done');
    if (sorted.length === 0) {
        section.innerHTML = '';
        return;
    }
    section.innerHTML = `
    <div class="dash-card dash-overdue">
      <div class="dash-section-title">Overdue</div>
      ${sorted.map(t => {
        const isDone = t.status === 'done';
        return `
          <div class="dash-item">
            <input type="checkbox" class="form-check-input task-done-checkbox" data-id="${t.id}" ${isDone ? 'checked' : ''} />
            <span class="dash-item-title${isDone ? ' dash-habit-done' : ''}">${escapeHtml(t.title)}${renderProfileBadge(t)}</span>
            <span class="dash-item-time">${formatDateWithTZ(t.due_at, timeZone, t.profile_timezone)}</span>
            <button class="btn btn-outline-danger btn-sm task-delete-btn" data-id="${t.id}">Delete</button>
          </div>
        `;
    }).join('')}
    </div>
  `;
}

function renderNoDeadline(tasks, timeZone) {
    const section = document.getElementById('noDeadlineTasks');
    if (!section) return;
    const sorted = sortByDone(tasks, t => t.status === 'done');
    if (sorted.length === 0) {
        section.innerHTML = renderEmpty('tasks without a deadline');
        return;
    }
    section.innerHTML = sorted.map(t => {
        const isDone = t.status === 'done';
        return `
        <div class="dash-item">
          <input type="checkbox" class="form-check-input task-done-checkbox" data-id="${t.id}" ${isDone ? 'checked' : ''} />
          <span class="dash-item-title${isDone ? ' dash-habit-done' : ''}">${escapeHtml(t.title)}${renderProfileBadge(t)}</span>
          <button class="btn btn-outline-danger btn-sm task-delete-btn" data-id="${t.id}">Delete</button>
        </div>
      `;
    }).join('');
}

function renderMixedList(mountId, { tasks = [], reminders = [], calendar_events = [] }, timeZone) {
    const mount = document.getElementById(mountId);
    const items = [
        ...tasks.map(t => ({ id: t.id, title: t.title, time: t.due_at, type: 'Task', is_done: t.status === 'done', profile_id: t.profile_id, profile_timezone: t.profile_timezone })),
        ...reminders.map(r => ({ id: r.id, title: r.title, time: r.remind_at, type: 'Reminder', is_done: !!r.is_done, profile_id: r.profile_id, profile_timezone: r.profile_timezone })),
        ...calendar_events.map(e => ({ id: e.id, title: e.title, time: e.starts_at, type: 'Event', is_done: false, profile_id: e.profile_id, profile_timezone: e.profile_timezone })),
    ].sort((a, b) => new Date(a.time) - new Date(b.time));

    const sorted = sortByDone(items, i => i.is_done);

    if (sorted.length === 0) {
        mount.innerHTML = renderEmpty('items');
        return;
    }

    mount.innerHTML = sorted.map(i => {
        const isDone = !!i.is_done;
        let checkbox = '';
        if (i.type === 'Task') {
            checkbox = `<input type="checkbox" class="form-check-input task-done-checkbox" data-id="${i.id}" ${isDone ? 'checked' : ''} />`;
        } else if (i.type === 'Reminder') {
            checkbox = `<input type="checkbox" class="form-check-input reminder-done-checkbox" data-id="${i.id}" ${isDone ? 'checked' : ''} />`;
        }

        let deleteBtn = '';
        if (i.type === 'Task') {
            deleteBtn = `<button class="btn btn-outline-danger btn-sm task-delete-btn" data-id="${i.id}">Delete</button>`;
        } else if (i.type === 'Reminder') {
            deleteBtn = `<button class="btn btn-outline-danger btn-sm reminder-delete-btn" data-id="${i.id}">Delete</button>`;
        } else if (i.type === 'Event') {
            deleteBtn = `<button class="btn btn-outline-danger btn-sm event-delete-btn" data-id="${i.id}">Delete</button>`;
        }

        return `
        <div class="dash-item">
          ${checkbox}
          <span class="dash-item-title${isDone ? ' dash-habit-done' : ''}">${escapeHtml(i.title)} <span class="text-muted">· ${i.type}</span>${renderProfileBadge(i)}</span>
          <span class="dash-item-time">${formatDateWithTZ(i.time, timeZone, i.profile_timezone)}</span>
          ${deleteBtn}
        </div>
      `;
    }).join('');
}

function renderProfileBadge(item) {
    const profileIds = [...new Set(allItemsWithProfileId())];
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

let allItemsCache = [];

function allItemsWithProfileId() {
    return allItemsCache.map(i => i.profile_id).filter(Boolean);
}

async function markHabitDone(habitId) {
    await apiFetch(`/habits/${habitId}/logs`, { method: 'POST' });
}

async function unmarkHabitDone(habitId, logDate) {
    await apiFetch(`/habits/${habitId}/logs/${logDate}`, { method: 'DELETE' });
}

let currentProfileFilter = null;
let profilesCache = [];
let timeZone = 'UTC';

async function loadDashboard(timeZone) {
    let url = '/dashboard';
    if (currentProfileFilter === 'all') {
        url += '?profile_ids=all';
    } else if (Array.isArray(currentProfileFilter) && currentProfileFilter.length > 0) {
        url += `?profile_ids=${currentProfileFilter.join(',')}`;
    }

    const data = await apiFetch(url);

    // Cache all items for profile badge rendering
    allItemsCache = [
        ...data.today.tasks,
        ...data.today.habits,
        ...data.today.reminders,
        ...data.today.calendar_events,
        ...data.tomorrow.tasks,
        ...data.tomorrow.reminders,
        ...data.tomorrow.calendar_events,
        ...data.next_7_days.tasks,
        ...data.next_7_days.reminders,
        ...data.next_7_days.calendar_events,
        ...data.overdue.tasks,
        ...(data.no_deadline?.tasks || []),
    ];

    // Cache profiles for badge rendering
    const profileIds = [...new Set(allItemsCache.map(i => i.profile_id).filter(Boolean))];
    if (profileIds.length > 0) {
        try {
            const { profiles } = await apiFetch('/profiles');
            profilesCache = profiles;
        } catch (err) {
            console.error('Failed to load profiles for badges:', err);
            profilesCache = [];
        }
    }

    renderOverdue(data.overdue.tasks, timeZone);
    renderNoDeadline(data.no_deadline?.tasks || [], timeZone);

    document.getElementById('todayTasks').innerHTML = renderTasks(data.today.tasks, timeZone);
    document.getElementById('todayHabits').innerHTML = renderHabits(data.today.habits);
    document.getElementById('todayReminders').innerHTML = renderReminders(data.today.reminders, timeZone);
    document.getElementById('todayEvents').innerHTML = renderEvents(data.today.calendar_events, timeZone);

    renderMixedList('tomorrowItems', data.tomorrow, timeZone);
    renderMixedList('next7Items', data.next_7_days, timeZone);

    // Wire up habit buttons
    document.querySelectorAll('.habit-done-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
                await markHabitDone(btn.dataset.habitId);
                await loadDashboard(timeZone);
            } catch (err) {
                showToast('Failed to mark habit done: ' + err.message);
                btn.disabled = false;
            }
        });
    });

    document.querySelectorAll('.habit-undo-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
                await unmarkHabitDone(btn.dataset.habitId, btn.dataset.logDate);
                await loadDashboard(timeZone);
            } catch (err) {
                showToast('Failed to undo habit: ' + err.message);
                btn.disabled = false;
            }
        });
    });

    // Wire up task done checkboxes
    document.querySelectorAll('.task-done-checkbox').forEach(cb => {
        cb.addEventListener('change', async () => {
            cb.disabled = true;
            try {
                await apiFetch(`/tasks/${cb.dataset.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: cb.checked ? 'done' : 'pending' }),
                });
                await loadDashboard(timeZone);
            } catch (err) {
                showToast('Failed to update task: ' + err.message);
                cb.disabled = false;
            }
        });
    });

    // Wire up task delete buttons
    document.querySelectorAll('.task-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ok = await confirmAction('Move this task to Bin?');
            if (!ok) return;
            btn.disabled = true;
            try {
                await apiFetch(`/tasks/${btn.dataset.id}`, { method: 'DELETE' });
                await loadDashboard(timeZone);
            } catch (err) {
                showToast('Failed to delete task: ' + err.message);
                btn.disabled = false;
            }
        });
    });

    // Wire up reminder done checkboxes
    document.querySelectorAll('.reminder-done-checkbox').forEach(cb => {
        cb.addEventListener('change', async () => {
            cb.disabled = true;
            try {
                await apiFetch(`/reminders/${cb.dataset.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ is_done: cb.checked }),
                });
                await loadDashboard(timeZone);
            } catch (err) {
                showToast('Failed to update reminder: ' + err.message);
                cb.disabled = false;
            }
        });
    });

    // Wire up reminder delete buttons
    document.querySelectorAll('.reminder-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ok = await confirmAction('Delete this reminder?');
            if (!ok) return;
            btn.disabled = true;
            try {
                await apiFetch(`/reminders/${btn.dataset.id}`, { method: 'DELETE' });
                await loadDashboard(timeZone);
            } catch (err) {
                showToast('Failed to delete reminder: ' + err.message);
                btn.disabled = false;
            }
        });
    });

    // Wire up calendar event delete buttons
    document.querySelectorAll('.event-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ok = await confirmAction('Delete this event?');
            if (!ok) return;
            btn.disabled = true;
            try {
                await apiFetch(`/calendar-events/${btn.dataset.id}`, { method: 'DELETE' });
                await loadDashboard(timeZone);
            } catch (err) {
                showToast('Failed to delete event: ' + err.message);
                btn.disabled = false;
            }
        });
    });
}

async function main() {
    const layoutInfo = await initLayout('dashboard');
    if (!layoutInfo) return; // initLayout already redirected to login

    try {
        const { settings } = await apiFetch('/settings');
        timeZone = settings.timezone;
    } catch (err) {
        console.error('Failed to load settings, defaulting dashboard times to UTC:', err);
    }

    // Initialize profile filter
    await initProfileFilter((profileIds) => {
        currentProfileFilter = profileIds;
        loadDashboard(timeZone);
    });

    try {
        await loadDashboard(timeZone);
    } catch (err) {
        console.error('Failed to load dashboard:', err);
        document.querySelector('.dashboard-page').innerHTML =
            `<div class="alert alert-danger">Failed to load dashboard: ${escapeHtml(err.message)}</div>`;
    }
}

main();