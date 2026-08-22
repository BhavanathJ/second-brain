import { initLayout } from '../layout.js';
import { apiFetch } from '../api.js';
import { showToast } from '../toast.js';
import { confirmAction } from '../confirmDialog.js';
import {
    getLocalDateString, addDays, addMonths,
    getLocalMonthBounds, getLocalWeekBounds, getLocalDayBounds,
} from '../timeUtils.js';

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

function formatTime(isoString, timeZone) {
    return new Date(isoString).toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
}

function labelForDate(dateStr, opts) {
    return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
}

let timeZone = 'UTC';
let weekStartsOn = 0;
let viewMode = 'month';
let anchorDateStr;
let itemsByDate = new Map();
let selectedDateStr = null;
const modalEl = document.getElementById('eventModal');
const modal = new bootstrap.Modal(modalEl);

function bucketData(data) {
    const map = new Map();
    const addItem = (dateStr, type, item) => {
        if (!map.has(dateStr)) map.set(dateStr, { tasks: [], events: [], reminders: [], habits: [] });
        map.get(dateStr)[type].push(item);
    };

    data.tasks.forEach(t => {
        if (!t.due_at) return;
        addItem(getLocalDateString(timeZone, new Date(t.due_at)), 'tasks', t);
    });
    data.calendarEvents.forEach(e => {
        addItem(getLocalDateString(timeZone, new Date(e.starts_at)), 'events', e);
    });
    data.reminders.forEach(r => {
        addItem(getLocalDateString(timeZone, new Date(r.remind_at)), 'reminders', r);
    });
    data.habitLogs.forEach(l => {
        addItem(l.log_date, 'habits', l);
    });

    return map;
}

function dotsHTML(items) {
    if (!items) return '';
    return ['tasks', 'events', 'reminders', 'habits']
        .filter(type => items[type].length > 0)
        .map(type => `<span class="cal-dot ${type.slice(0, -1)}"></span>`).join('');
}

function renderMonthGrid() {
    const grid = document.getElementById('calGrid');
    const [y, m] = anchorDateStr.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const todayStr = getLocalDateString(timeZone);

    // Respect the profile's week_starts_on setting (0=Sun, 1=Mon) - rotate
    // the header labels and pad the leading blanks to start the 1st of the
    // month in the correct column, matching the week view's behavior.
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const headers = [
        ...weekdayNames.slice(weekStartsOn),
        ...weekdayNames.slice(0, weekStartsOn),
    ].map(d => `<div class="cal-weekday">${d}</div>`).join('');
    const leaderOffset = (firstWeekday - weekStartsOn + 7) % 7;
    const blanks = Array.from({ length: leaderOffset }, () => `<div class="cal-day-cell empty"></div>`).join('');

    const days = Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const items = itemsByDate.get(dateStr);
        return `
      <div class="cal-day-cell${dateStr === todayStr ? ' today' : ''}${dateStr === selectedDateStr ? ' selected' : ''}" data-date="${dateStr}">
        <div class="cal-day-number">${day}</div>
        <div class="cal-day-dots">${dotsHTML(items)}</div>
      </div>
    `;
    }).join('');

    grid.className = 'cal-grid';
    grid.innerHTML = headers + blanks + days;
    wireDayCellClicks();
}

function renderWeekGrid(weekStartStr) {
    const grid = document.getElementById('calGrid');
    const todayStr = getLocalDateString(timeZone);

    const cells = Array.from({ length: 7 }, (_, i) => {
        const dateStr = addDays(weekStartStr, i);
        const items = itemsByDate.get(dateStr);
        const dayNum = Number(dateStr.split('-')[2]);
        const weekdayLabel = labelForDate(dateStr, { weekday: 'short' });
        return `
      <div class="cal-day-cell${dateStr === todayStr ? ' today' : ''}${dateStr === selectedDateStr ? ' selected' : ''}" data-date="${dateStr}" style="min-height: 90px;">
        <div class="cal-weekday" style="text-align:left; padding:0;">${weekdayLabel}</div>
        <div class="cal-day-number">${dayNum}</div>
        <div class="cal-day-dots">${dotsHTML(items)}</div>
      </div>
    `;
    }).join('');

    grid.className = 'cal-grid';
    grid.innerHTML = cells;
    wireDayCellClicks();
}

function wireDayCellClicks() {
    document.querySelectorAll('.cal-day-cell:not(.empty)').forEach(cell => {
        cell.addEventListener('click', () => {
            selectedDateStr = cell.dataset.date;
            renderCurrentView();
        });
    });
}

function renderDayPanel() {
    const panel = document.getElementById('dayPanel');
    if (!selectedDateStr) {
        panel.innerHTML = '<div class="dash-empty">Click a day to see its items.</div>';
        return;
    }

    const items = itemsByDate.get(selectedDateStr);
    const label = labelForDate(selectedDateStr, { weekday: 'long', month: 'long', day: 'numeric' });

    const rows = items ? [
        ...items.tasks.map(t => ({ badge: 'task', title: t.title, time: t.due_at ? formatTime(t.due_at, timeZone) : '', deletable: false })),
        ...items.events.map(e => ({ badge: 'event', title: e.title, time: formatTime(e.starts_at, timeZone), deletable: true, id: e.id })),
        ...items.reminders.map(r => ({ badge: 'reminder', title: r.title, time: formatTime(r.remind_at, timeZone), deletable: false })),
        ...items.habits.map(h => ({ badge: 'habit', title: h.habits?.title ?? 'Habit', time: '✓ done', deletable: false })),
    ] : [];

    panel.innerHTML = `
    <div class="dash-section-title">${label}</div>
    ${rows.length === 0 ? '<div class="dash-empty">Nothing on this day.</div>' : rows.map(r => `
      <div class="cal-panel-item">
        <span class="cal-panel-badge ${r.badge}">${r.badge}</span>
        <span class="flex-grow-1">${escapeHtml(r.title)}</span>
        <span class="dash-item-time">${r.time}</span>
        ${r.deletable ? `<button class="btn btn-outline-danger btn-sm cal-event-delete-btn" data-id="${r.id}">Delete</button>` : ''}
      </div>
    `).join('')}
  `;

    wireDeleteButtons();
}

function wireDeleteButtons() {
    document.querySelectorAll('.cal-event-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const ok = await confirmAction('Delete this calendar event?');
            if (!ok) return;
            try {
                await apiFetch(`/calendar-events/${btn.dataset.id}`, { method: 'DELETE' });
                showToast('Event deleted', 'success');
                await loadView();
            } catch (err) {
                showToast('Failed to delete event: ' + err.message);
            }
        });
    });
}

function renderCurrentView() {
    if (viewMode === 'month') {
        renderMonthGrid();
        document.getElementById('periodLabel').textContent = labelForDate(anchorDateStr, { month: 'long', year: 'numeric' });
    } else if (viewMode === 'week') {
        const { weekStartStr, weekEndStr } = getLocalWeekBounds(timeZone, weekStartsOn, anchorDateStr);
        renderWeekGrid(weekStartStr);
        document.getElementById('periodLabel').textContent =
            `${labelForDate(weekStartStr, { month: 'short', day: 'numeric' })} – ${labelForDate(weekEndStr, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else {
        document.getElementById('calGrid').innerHTML = '';
        selectedDateStr = anchorDateStr;
        document.getElementById('periodLabel').textContent = labelForDate(anchorDateStr, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    renderDayPanel();
}

function boundsForCurrentView() {
    if (viewMode === 'month') return getLocalMonthBounds(timeZone, anchorDateStr);
    if (viewMode === 'week') return getLocalWeekBounds(timeZone, weekStartsOn, anchorDateStr);
    return getLocalDayBounds(timeZone, anchorDateStr);
}

async function loadView() {
    const { startISO, endISO } = boundsForCurrentView();
    const data = await apiFetch(`/calendar?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`);
    itemsByDate = bucketData(data);
    renderCurrentView();
}

function navigate(delta) {
    if (viewMode === 'month') anchorDateStr = addMonths(anchorDateStr, delta);
    else if (viewMode === 'week') anchorDateStr = addDays(anchorDateStr, delta * 7);
    else anchorDateStr = addDays(anchorDateStr, delta);

    if (viewMode !== 'day') selectedDateStr = null;
    loadView();
}

function switchView(mode) {
    viewMode = mode;
    document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === mode));
    if (mode === 'day') selectedDateStr = anchorDateStr;
    loadView();
}

async function handleEventSubmit(e) {
    e.preventDefault();
    const payload = {
        title: document.getElementById('eventTitle').value.trim(),
        starts_at: new Date(document.getElementById('eventStartsAt').value).toISOString(),
        ends_at: document.getElementById('eventEndsAt').value
            ? new Date(document.getElementById('eventEndsAt').value).toISOString()
            : null,
        location: document.getElementById('eventLocation').value.trim() || null,
    };

    try {
        await apiFetch('/calendar-events', { method: 'POST', body: JSON.stringify(payload) });
        modal.hide();
        document.getElementById('eventForm').reset();
        showToast('Event saved', 'success');
        await loadView();
    } catch (err) {
        showToast('Failed to save event: ' + err.message);
    }
}

async function main() {
    const layoutInfo = await initLayout('calendar');
    if (!layoutInfo) return;

    try {
        const { settings } = await apiFetch('/settings');
        timeZone = settings.timezone;
        weekStartsOn = settings.week_starts_on;
    } catch (err) {
        console.error('Failed to load settings, defaulting calendar to UTC/Sunday-start:', err);
    }

    anchorDateStr = getLocalDateString(timeZone);
    selectedDateStr = anchorDateStr; // auto-select today on initial load, in every view mode

    document.getElementById('prevBtn').addEventListener('click', () => navigate(-1));
    document.getElementById('nextBtn').addEventListener('click', () => navigate(1));
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
    document.getElementById('addEventBtn').addEventListener('click', () => modal.show());
    document.getElementById('eventForm').addEventListener('submit', handleEventSubmit);

    try {
        await loadView();
    } catch (err) {
        console.error('Failed to load calendar:', err);
        document.querySelector('.calendar-page').insertAdjacentHTML('beforeend',
            `<div class="alert alert-danger">Failed to load calendar: ${escapeHtml(err.message)}</div>`);
    }
}

main();