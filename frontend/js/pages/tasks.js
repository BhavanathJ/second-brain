import { initLayout } from '../layout.js';
import { apiFetch } from '../api.js';
import { showToast } from '../toast.js';
import { confirmAction } from '../confirmDialog.js';
import { initProfileFilter } from '../profileFilter.js';
import { formatDateTimeWithTZ } from '../timeUtils.js';
import { escapeHtml, renderProfileBadge as renderBadgeMarkup } from '../utils.js';

let timeZone = 'UTC';
let allTasks = [];
let modal = null;
let viewModal = null;
let currentProfileFilter = null; // null, 'all', or array of profile IDs
let profilesCache = [];

function bucketTasks(tasks) {
    return {
        doFirst: tasks.filter(t => t.urgent && t.important),
        schedule: tasks.filter(t => !t.urgent && t.important),
        delegate: tasks.filter(t => t.urgent && !t.important),
        eliminate: tasks.filter(t => !t.urgent && !t.important),
    };
}

function renderTaskItem(task) {
    const profileIds = [...new Set(allTasks.map(t => t.profile_id))];
    const showProfileBadge = profileIds.length > 1 && task.profile_id;
    const profileBadge = showProfileBadge
        ? renderBadgeMarkup(profilesCache.find(p => p.id === task.profile_id))
        : '';

    return `
    <div class="task-item${task.status === 'done' ? ' task-done' : ''}">
      <input type="checkbox" class="form-check-input task-done-checkbox" data-id="${task.id}" ${task.status === 'done' ? 'checked' : ''} />
      <div class="task-item-body">
        <div class="task-item-title">${escapeHtml(task.title)} ${profileBadge}</div>
        ${task.due_at ? `<div class="task-item-time">${formatDateTimeWithTZ(task.due_at, timeZone, task.profile_timezone)}</div>` : ''}
      </div>
      <div class="task-item-actions">
        <button class="btn btn-outline-secondary task-view-btn" data-id="${task.id}">View</button>
        <button class="btn btn-outline-secondary task-edit-btn" data-id="${task.id}">Edit</button>
        <button class="btn btn-outline-danger task-delete-btn" data-id="${task.id}">Delete</button>
      </div>
    </div>
  `;
}

// Stable sort: done tasks last, preserving relative order otherwise —
// same pattern already used on the dashboard (dashboard.js sortByDone).
function sortByDone(tasks) {
    return [...tasks].sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0));
}

function renderQuadrant(mountId, tasks) {
    const mount = document.getElementById(mountId);
    const sorted = sortByDone(tasks);
    mount.innerHTML = sorted.length === 0
        ? '<div class="dash-empty">Nothing here.</div>'
        : sorted.map(renderTaskItem).join('');
}

function render() {
    const buckets = bucketTasks(allTasks);
    renderQuadrant('quadrant-do-first', buckets.doFirst);
    renderQuadrant('quadrant-schedule', buckets.schedule);
    renderQuadrant('quadrant-delegate', buckets.delegate);
    renderQuadrant('quadrant-eliminate', buckets.eliminate);
    wireItemEvents();
}

async function loadTasks() {
    let url = '/tasks';
    if (currentProfileFilter === 'all') {
        url += '?profile_ids=all';
    } else if (Array.isArray(currentProfileFilter) && currentProfileFilter.length > 0) {
        url += `?profile_ids=${currentProfileFilter.join(',')}`;
    }
    // null -> no param (backward compatible)

    const { tasks } = await apiFetch(url);
    allTasks = tasks;

    // Cache profiles for badge rendering
    const profileIds = [...new Set(tasks.map(t => t.profile_id).filter(Boolean))];
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
    document.querySelectorAll('.task-done-checkbox').forEach(cb => {
        cb.addEventListener('change', async () => {
            cb.disabled = true;
            try {
                await apiFetch(`/tasks/${cb.dataset.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: cb.checked ? 'done' : 'pending' }),
                });
                await loadTasks();
            } catch (err) {
                showToast('Failed to update task: ' + err.message);
                cb.disabled = false;
            }
        });
    });

    document.querySelectorAll('.task-view-btn').forEach(btn => {
        btn.addEventListener('click', () => openViewModal(btn.dataset.id));
    });

    document.querySelectorAll('.task-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => openModal(btn.dataset.id));
    });

    document.querySelectorAll('.task-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ok = await confirmAction('Move this task to Bin?');
            if (!ok) return;
            try {
                await apiFetch(`/tasks/${btn.dataset.id}`, { method: 'DELETE' });
                showToast('Task moved to Bin', 'success');
                await loadTasks();
            } catch (err) {
                showToast('Failed to delete task: ' + err.message);
            }
        });
    });
}

function localInputToISO(value) {
    if (!value) return null;
    return new Date(value).toISOString();
}

function isoToLocalInput(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function openModal(taskId) {
    if (!modal) {
        const modalEl = document.getElementById('taskModal');
        modal = new bootstrap.Modal(modalEl);
    }
    const form = document.getElementById('taskForm');
    form.reset();
    document.getElementById('taskId').value = '';

    if (taskId) {
        const task = allTasks.find(t => t.id === taskId);
        if (!task) return;
        document.getElementById('taskModalTitle').textContent = 'Edit Task';
        document.getElementById('taskId').value = task.id;
        document.getElementById('taskTitle').value = task.title;
        document.getElementById('taskDescription').value = task.description ?? '';
        document.getElementById('taskDueAt').value = isoToLocalInput(task.due_at);
        document.getElementById('taskUrgent').checked = task.urgent;
        document.getElementById('taskImportant').checked = task.important;
    } else {
        document.getElementById('taskModalTitle').textContent = 'Add Task';
    }

    modal.show();
}

function openViewModal(taskId) {
    if (!viewModal) {
        const viewModalEl = document.getElementById('viewTaskModal');
        viewModal = new bootstrap.Modal(viewModalEl);
    }
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('viewTaskTitle').textContent = task.title;
    document.getElementById('viewTaskDescription').textContent = task.description ?? '—';
    document.getElementById('viewTaskDueAt').textContent = task.due_at ? formatDateTimeWithTZ(task.due_at, timeZone, task.profile_timezone) : '—';
    document.getElementById('viewTaskStatus').textContent = task.status === 'done' ? 'Done' : 'Pending';
    document.getElementById('viewTaskUrgent').checked = task.urgent;
    document.getElementById('viewTaskImportant').checked = task.important;

    // Set up Edit button to close view modal and open edit modal
    const editBtn = document.getElementById('viewTaskEditBtn');
    editBtn.onclick = () => {
        viewModal.hide();
        openModal(task.id);
    };

    viewModal.show();
}

async function handleSubmit(e) {
    e.preventDefault();

    const taskId = document.getElementById('taskId').value;
    const payload = {
        title: document.getElementById('taskTitle').value.trim(),
        description: document.getElementById('taskDescription').value.trim() || null,
        due_at: localInputToISO(document.getElementById('taskDueAt').value),
        urgent: document.getElementById('taskUrgent').checked,
        important: document.getElementById('taskImportant').checked,
    };

    try {
        if (taskId) {
            await apiFetch(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        } else {
            await apiFetch('/tasks', { method: 'POST', body: JSON.stringify(payload) });
        }
        modal.hide();
        showToast('Task saved', 'success');
        await loadTasks();
    } catch (err) {
        showToast('Failed to save task: ' + err.message);
    }
}

async function main() {
    const layoutInfo = await initLayout('tasks');
    if (!layoutInfo) return;

    try {
        const { settings } = await apiFetch('/settings');
        timeZone = settings.timezone;
    } catch (err) {
        console.error('Failed to load settings, defaulting task times to UTC:', err);
    }

    // Initialize profile filter
    await initProfileFilter((profileIds) => {
        currentProfileFilter = profileIds;
        loadTasks();
    });

    document.getElementById('addTaskBtn').addEventListener('click', () => openModal(null));
    document.getElementById('taskForm').addEventListener('submit', handleSubmit);

    try {
        await loadTasks();
    } catch (err) {
        console.error('Failed to load tasks:', err);
        document.querySelector('.tasks-page').insertAdjacentHTML('beforeend',
            `<div class="alert alert-danger">Failed to load tasks: ${escapeHtml(err.message)}</div>`);
    }
}

main();