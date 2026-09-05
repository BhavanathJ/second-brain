import { initLayout } from '../layout.js';
import { apiFetch } from '../api.js';
import { initProfileFilter } from '../profileFilter.js';

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

function renderTasks(tasks, timeZone) {
    if (tasks.length === 0) return renderEmpty('tasks');
    return tasks.map(t => `
    <div class="dash-item">
      <span class="dash-item-title">${escapeHtml(t.title)}${renderProfileBadge(t)}</span>
      ${t.due_at ? `<span class="dash-item-time">${formatTimeWithTZ(t.due_at, timeZone, t.profile_timezone)}</span>` : ''}
    </div>
  `).join('');
}

function renderReminders(reminders, timeZone) {
    if (reminders.length === 0) return renderEmpty('reminders');
    return reminders.map(r => `
    <div class="dash-item">
      <span class="dash-item-title">${escapeHtml(r.title)}${renderProfileBadge(r)}</span>
      <span class="dash-item-time">${formatTimeWithTZ(r.remind_at, timeZone, r.profile_timezone)}</span>
    </div>
  `).join('');
}

function renderEvents(events, timeZone) {
    if (events.length === 0) return renderEmpty('events');
    return events.map(e => `
    <div class="dash-item">
      <span class="dash-item-title">${escapeHtml(e.title)}${renderProfileBadge(e)}</span>
      <span class="dash-item-time">${formatTimeWithTZ(e.starts_at, timeZone, e.profile_timezone)}</span>
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
    if (tasks.length === 0) {
        section.innerHTML = '';
        return;
    }
    section.innerHTML = `
    <div class="dash-card dash-overdue">
      <div class="dash-section-title">Overdue</div>
      ${tasks.map(t => `
        <div class="dash-item">
          <span class="dash-item-title">${escapeHtml(t.title)}${renderProfileBadge(t)}</span>
          <span class="dash-item-time">${formatDateWithTZ(t.due_at, timeZone, t.profile_timezone)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderMixedList(mountId, { tasks = [], reminders = [], calendar_events = [] }, timeZone) {
    const mount = document.getElementById(mountId);
    const items = [
        ...tasks.map(t => ({ title: t.title, time: t.due_at, type: 'Task', profile_id: t.profile_id, profile_timezone: t.profile_timezone })),
        ...reminders.map(r => ({ title: r.title, time: r.remind_at, type: 'Reminder', profile_id: r.profile_id, profile_timezone: r.profile_timezone })),
        ...calendar_events.map(e => ({ title: e.title, time: e.starts_at, type: 'Event', profile_id: e.profile_id, profile_timezone: e.profile_timezone })),
    ].sort((a, b) => new Date(a.time) - new Date(b.time));

    if (items.length === 0) {
        mount.innerHTML = renderEmpty('items');
        return;
    }

    mount.innerHTML = items.map(i => `
    <div class="dash-item">
      <span class="dash-item-title">${escapeHtml(i.title)} <span class="text-muted">· ${i.type}</span>${renderProfileBadge(i)}</span>
      <span class="dash-item-time">${formatDateWithTZ(i.time, timeZone, i.profile_timezone)}</span>
    </div>
  `).join('');
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

    document.getElementById('todayTasks').innerHTML = renderTasks(data.today.tasks, timeZone);
    document.getElementById('todayHabits').innerHTML = renderHabits(data.today.habits);
    document.getElementById('todayReminders').innerHTML = renderReminders(data.today.reminders, timeZone);
    document.getElementById('todayEvents').innerHTML = renderEvents(data.today.calendar_events, timeZone);

    renderMixedList('tomorrowItems', data.tomorrow, timeZone);
    renderMixedList('next7Items', data.next_7_days, timeZone);

    // Wire up "Mark done" and "Undo" buttons — re-attached every render
    // since buttons are recreated each time the dashboard reloads.
    document.querySelectorAll('.habit-done-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
                await markHabitDone(btn.dataset.habitId);
                await loadDashboard(timeZone); // full reload — simplest way to keep counts/streaks in sync
            } catch (err) {
                alert('Failed to mark habit done: ' + err.message);
                btn.disabled = false;
            }
        });
    });

    document.querySelectorAll('.habit-undo-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
                // Uses the exact date string the server returned in
                // today_date — never computed client-side. If it no
                // longer matches (e.g. midnight passed since page load),
                // the DELETE simply finds no matching log and 404s harmlessly.
                await unmarkHabitDone(btn.dataset.habitId, btn.dataset.logDate);
                await loadDashboard(timeZone);
            } catch (err) {
                alert('Failed to undo: ' + err.message);
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