import { initLayout, getCachedSettings, fetchSettingsFast } from '../layout.js';
import { apiFetch } from '../api.js';

// Basic HTML-escaping for any user-supplied text (task titles, note
// content, etc.) before it goes into innerHTML - without this, a task
// titled "<img src=x onerror=alert(1)>" would execute as real HTML.
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

function renderSkeletons(count = 2) {
    return Array.from({ length: count }, () => `
        <div class="dash-item sb-skeleton sb-skeleton-card">
            <div style="flex:1;">
                <div class="sb-skeleton-line w-80"></div>
                <div class="sb-skeleton-line w-40"></div>
            </div>
        </div>
    `).join('');
}

function showLoadingSkeletons() {
    document.getElementById('todayTasks').innerHTML = renderSkeletons(2);
    document.getElementById('todayHabits').innerHTML = renderSkeletons(2);
    document.getElementById('todayReminders').innerHTML = renderSkeletons(2);
    document.getElementById('todayEvents').innerHTML = renderSkeletons(2);
    document.getElementById('tomorrowItems').innerHTML = renderSkeletons(2);
    document.getElementById('next7Items').innerHTML = renderSkeletons(2);
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

function renderEmpty(label) {
    return `<div class="dash-empty">No ${label} - nice.</div>`;
}

function renderTasks(tasks, timeZone) {
    if (tasks.length === 0) return renderEmpty('tasks');
    return tasks.map(t => `
    <div class="dash-item">
      <span class="dash-item-title">${escapeHtml(t.title)}</span>
      ${t.due_at ? `<span class="dash-item-time">${formatTime(t.due_at, timeZone)}</span>` : ''}
    </div>
  `).join('');
}

function renderReminders(reminders, timeZone) {
    if (reminders.length === 0) return renderEmpty('reminders');
    return reminders.map(r => `
    <div class="dash-item">
      <span class="dash-item-title">${escapeHtml(r.title)}</span>
      <span class="dash-item-time">${formatTime(r.remind_at, timeZone)}</span>
    </div>
  `).join('');
}

function renderEvents(events, timeZone) {
    if (events.length === 0) return renderEmpty('events');
    return events.map(e => `
    <div class="dash-item">
      <span class="dash-item-title">${escapeHtml(e.title)}</span>
      <span class="dash-item-time">${formatTime(e.starts_at, timeZone)}</span>
    </div>
  `).join('');
}

// Habits with completed_today=true get an "Undo" button using
// today_date - the exact local date string the SERVER computed and
// returned alongside completed_today. Never guessed client-side.
function renderHabits(habits) {
    if (habits.length === 0) return renderEmpty('habits');
    return habits.map(h => `
    <div class="dash-item">
      <span class="dash-item-title${h.completed_today ? ' dash-habit-done' : ''}">${escapeHtml(h.title)}</span>
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
          <span class="dash-item-title">${escapeHtml(t.title)}</span>
          <span class="dash-item-time">${formatDate(t.due_at, timeZone)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderMixedList(mountId, { tasks = [], reminders = [], calendar_events = [] }, timeZone) {
    const mount = document.getElementById(mountId);
    const items = [
        ...tasks.map(t => ({ title: t.title, time: t.due_at, type: 'Task' })),
        ...reminders.map(r => ({ title: r.title, time: r.remind_at, type: 'Reminder' })),
        ...calendar_events.map(e => ({ title: e.title, time: e.starts_at, type: 'Event' })),
    ].sort((a, b) => new Date(a.time) - new Date(b.time));

    if (items.length === 0) {
        mount.innerHTML = renderEmpty('items');
        return;
    }

    mount.innerHTML = items.map(i => `
    <div class="dash-item">
      <span class="dash-item-title">${escapeHtml(i.title)} <span class="text-muted">· ${i.type}</span></span>
      <span class="dash-item-time">${formatDate(i.time, timeZone)}</span>
    </div>
  `).join('');
}

async function markHabitDone(habitId) {
    await apiFetch(`/habits/${habitId}/logs`, { method: 'POST' });
}

async function unmarkHabitDone(habitId, logDate) {
    await apiFetch(`/habits/${habitId}/logs/${logDate}`, { method: 'DELETE' });
}

function applyDashboardData(data, timeZone) {
    renderOverdue(data.overdue.tasks, timeZone);

    document.getElementById('todayTasks').innerHTML = renderTasks(data.today.tasks, timeZone);
    document.getElementById('todayHabits').innerHTML = renderHabits(data.today.habits);
    document.getElementById('todayReminders').innerHTML = renderReminders(data.today.reminders, timeZone);
    document.getElementById('todayEvents').innerHTML = renderEvents(data.today.calendar_events, timeZone);

    renderMixedList('tomorrowItems', data.tomorrow, timeZone);
    renderMixedList('next7Items', data.next_7_days, timeZone);

    // Wire up "Mark done" and "Undo" buttons
    document.querySelectorAll('.habit-done-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
                await markHabitDone(btn.dataset.habitId);
                await loadDashboard(timeZone);
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
                await unmarkHabitDone(btn.dataset.habitId, btn.dataset.logDate);
                await loadDashboard(timeZone);
            } catch (err) {
                alert('Failed to undo: ' + err.message);
                btn.disabled = false;
            }
        });
    });
}

async function loadDashboard(timeZone) {
    const data = await apiFetch('/dashboard');
    applyDashboardData(data, timeZone);
}

async function main() {
    // 1. Show skeletons immediately for zero perceived latency
    showLoadingSkeletons();

    // 2. Initialize layout & read cached timezone immediately
    const layoutPromise = initLayout('dashboard');
    const cachedSettings = getCachedSettings();
    let timeZone = cachedSettings.timezone || 'UTC';

    // 3. Parallel fetch dashboard data and fresh settings
    try {
        const [layoutInfo, dashboardData, freshSettings] = await Promise.all([
            layoutPromise,
            apiFetch('/dashboard'),
            fetchSettingsFast()
        ]);

        if (!layoutInfo) return; // redirect occurred

        timeZone = freshSettings?.timezone || timeZone;
        applyDashboardData(dashboardData, timeZone);
    } catch (err) {
        console.error('Failed to load dashboard:', err);
        document.querySelector('.dashboard-page').innerHTML =
            `<div class="alert alert-danger">Failed to load dashboard: ${escapeHtml(err.message)}</div>`;
    }
}

main();