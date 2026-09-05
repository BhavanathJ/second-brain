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

function getLocalDateString(timeZone, date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function addDays(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return dt.toISOString().split('T')[0];
}

function dayLabel(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })[0];
}

function formatDateWithTZ(isoString, timeZone, itemTimeZone) {
    const base = formatDate(isoString, timeZone);
    if (!itemTimeZone || itemTimeZone === timeZone) return base;
    return `${base} (${itemTimeZone})`;
}

function formatDate(isoString, timeZone) {
    if (!isoString) return '';
    return new Date(isoString).toLocaleDateString('en-US', {
        timeZone,
        month: 'short',
        day: 'numeric',
    });
}

let timeZone = 'UTC';
let habits = [];
let last7Days = [];
const modalEl = document.getElementById('habitModal');
const modal = new bootstrap.Modal(modalEl);
let currentProfileFilter = null;
let profilesCache = [];

function renderProfileBadge(item) {
    const profileIds = [...new Set(habits.map(h => h.profile_id).filter(Boolean))];
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

async function loadHabits() {
    let url = '/habits';
    if (currentProfileFilter === 'all') {
        url += '?profile_ids=all';
    } else if (Array.isArray(currentProfileFilter) && currentProfileFilter.length > 0) {
        url += `?profile_ids=${currentProfileFilter.join(',')}`;
    }

    const { habits: fetchedHabits } = await apiFetch(url);
    habits = fetchedHabits;

    const todayStr = getLocalDateString(timeZone);
    last7Days = Array.from({ length: 7 }, (_, i) => addDays(todayStr, i - 6));

    const logsPerHabit = await Promise.all(
        habits.map(h => apiFetch(`/habits/${h.id}/logs?start=${last7Days[0]}&end=${last7Days[6]}`))
    );

    habits = habits.map((h, i) => ({
        ...h,
        loggedDates: new Set(logsPerHabit[i].logs.filter(l => l.completed).map(l => l.log_date)),
    }));

    // Cache profiles for badge rendering
    const profileIds = [...new Set(habits.map(h => h.profile_id).filter(Boolean))];
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

function renderDayGrid(habit) {
    const todayStr = getLocalDateString(timeZone);
    return `
    <div class="habit-week-grid">
      ${last7Days.map(dateStr => {
        const isDone = habit.loggedDates.has(dateStr);
        const isToday = dateStr === todayStr;
        return `<div class="habit-day-cell${isDone ? ' done' : ''}${isToday ? ' today' : ''}"
                     data-habit-id="${habit.id}" data-date="${dateStr}">${dayLabel(dateStr)}</div>`;
    }).join('')}
    </div>
  `;
}

function renderHabitCard(habit) {
    const pct = Math.min(100, Math.round((habit.this_week_count / habit.target_per_week) * 100));
    return `
    <div class="habit-card">
      <div class="habit-card-header">
        <div>
          <div class="habit-title">${escapeHtml(habit.title)}${renderProfileBadge(habit)}</div>
          <div class="habit-progress-label">${habit.this_week_count} / ${habit.target_per_week} this week</div>
        </div>
        <div class="habit-streak">🔥 ${habit.streak} wk streak</div>
      </div>
      <div class="progress" style="height: 6px;">
        <div class="progress-bar" role="progressbar" style="width: ${pct}%; background-color: var(--sb-accent);"></div>
      </div>
      ${renderDayGrid(habit)}
      <div class="habit-actions">
        <button class="btn btn-outline-secondary habit-edit-btn" data-id="${habit.id}">Edit</button>
        <button class="btn btn-outline-danger habit-delete-btn" data-id="${habit.id}">Delete</button>
      </div>
    </div>
  `;
}

function render() {
    const mount = document.getElementById('habitsList');
    mount.innerHTML = habits.length === 0
        ? '<div class="dash-empty">No habits yet — add one to start tracking.</div>'
        : habits.map(renderHabitCard).join('');
    wireEvents();
}

function wireEvents() {
    document.querySelectorAll('.habit-day-cell').forEach(cell => {
        cell.addEventListener('click', async () => {
            const habitId = cell.dataset.habitId;
            const date = cell.dataset.date;
            const isDone = cell.classList.contains('done');
            try {
                if (isDone) {
                    await apiFetch(`/habits/${habitId}/logs/${date}`, { method: 'DELETE' });
                } else {
                    await apiFetch(`/habits/${habitId}/logs`, { method: 'POST', body: JSON.stringify({ date }) });
                }
                await loadHabits();
            } catch (err) {
                showToast('Failed to update log: ' + err.message);
            }
        });
    });

    document.querySelectorAll('.habit-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => openModal(btn.dataset.id));
    });

    document.querySelectorAll('.habit-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ok = await confirmAction('Move this habit to Bin? Its history will be kept.');
            if (!ok) return;
            try {
                await apiFetch(`/habits/${btn.dataset.id}`, { method: 'DELETE' });
                showToast('Habit moved to Bin', 'success');
                await loadHabits();
            } catch (err) {
                showToast('Failed to delete habit: ' + err.message);
            }
        });
    });
}

function openModal(habitId) {
    const form = document.getElementById('habitForm');
    form.reset();
    document.getElementById('habitId').value = '';

    if (habitId) {
        const habit = habits.find(h => h.id === habitId);
        if (!habit) return;
        document.getElementById('habitModalTitle').textContent = 'Edit Habit';
        document.getElementById('habitId').value = habit.id;
        document.getElementById('habitTitle').value = habit.title;
        document.getElementById('habitTarget').value = habit.target_per_week;
    } else {
        document.getElementById('habitModalTitle').textContent = 'Add Habit';
        document.getElementById('habitTarget').value = 7;
    }

    modal.show();
}

async function handleSubmit(e) {
    e.preventDefault();
    const habitId = document.getElementById('habitId').value;
    const payload = {
        title: document.getElementById('habitTitle').value.trim(),
        target_per_week: Number(document.getElementById('habitTarget').value),
    };

    try {
        if (habitId) {
            await apiFetch(`/habits/${habitId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        } else {
            await apiFetch('/habits', { method: 'POST', body: JSON.stringify(payload) });
        }
        modal.hide();
        showToast('Habit saved', 'success');
        await loadHabits();
    } catch (err) {
        showToast('Failed to save habit: ' + err.message);
    }
}

async function main() {
    const layoutInfo = await initLayout('habits');
    if (!layoutInfo) return;

    try {
        const { settings } = await apiFetch('/settings');
        timeZone = settings.timezone;
    } catch (err) {
        console.error('Failed to load settings, defaulting habit dates to UTC:', err);
    }

    // Initialize profile filter
    await initProfileFilter((profileIds) => {
        currentProfileFilter = profileIds;
        loadHabits();
    });

    document.getElementById('addHabitBtn').addEventListener('click', () => openModal(null));
    document.getElementById('habitForm').addEventListener('submit', handleSubmit);

    try {
        await loadHabits();
    } catch (err) {
        console.error('Failed to load habits:', err);
        document.querySelector('.habits-page').insertAdjacentHTML('beforeend',
            `<div class="alert alert-danger">Failed to load habits: ${escapeHtml(err.message)}</div>`);
    }
}

main();