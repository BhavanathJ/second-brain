import { initLayout } from '../layout.js';
import { apiFetch } from '../api.js';
import { showToast } from '../toast.js';
import { confirmAction } from '../confirmDialog.js';

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

function formatDateTime(isoString, timeZone) {
    if (!isoString) return '';
    return new Date(isoString).toLocaleString('en-US', {
        timeZone,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

let timeZone = 'UTC';
let allTasks = [];
const modalEl = document.getElementById('taskModal');
const modal = new bootstrap.Modal(modalEl);

function bucketTasks(tasks) {
    return {
        doFirst: tasks.filter(t => t.urgent && t.important),
        schedule: tasks.filter(t => !t.urgent && t.important),
        delegate: tasks.filter(t => t.urgent && !t.important),
        eliminate: tasks.filter(t => !t.urgent && !t.important),
    };
}

function renderTaskItem(task) {
    return `
    <div class="task-item${task.status === 'done' ? ' task-done' : ''}">
      <input type="checkbox" class="form-check-input task-done-checkbox" data-id="${task.id}" ${task.status === 'done' ? 'checked' : ''} />
      <div class="task-item-body">
        <div class="task-item-title">${escapeHtml(task.title)}</div>
        ${task.due_at ? `<div class="task-item-time">${formatDateTime(task.due_at, timeZone)}</div>` : ''}
      </div>
      <div class="task-item-actions">
        <button class="btn btn-outline-secondary task-edit-btn" data-id="${task.id}">Edit</button>
        <button class="btn btn-outline-danger task-delete-btn" data-id="${task.id}">Delete</button>
      </div>
    </div>
  `;
}

function renderQuadrant(mountId, tasks) {
    const mount = document.getElementById(mountId);
    mount.innerHTML = tasks.length === 0
        ? '<div class="dash-empty">Nothing here.</div>'
        : tasks.map(renderTaskItem).join('');
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
    const { tasks } = await apiFetch('/tasks');
    allTasks = tasks;
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