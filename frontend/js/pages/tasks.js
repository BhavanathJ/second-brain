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
        <div class="task-item sb-skeleton sb-skeleton-card">
            <div style="flex:1;">
                <div class="sb-skeleton-line w-80"></div>
                <div class="sb-skeleton-line w-40"></div>
            </div>
        </div>
    `).join('');
}

function showLoadingSkeletons() {
    ['quadrant-do-first', 'quadrant-schedule', 'quadrant-delegate', 'quadrant-eliminate'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = renderSkeletons(2);
    });
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

let timeZone = getCachedSettings().timezone || 'UTC';
let allTasks = [];
let modal = null;
let viewModal = null;

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
        <button class="btn btn-outline-secondary task-view-btn" data-id="${task.id}">View</button>
        <button class="btn btn-outline-secondary task-edit-btn" data-id="${task.id}">Edit</button>
        <button class="btn btn-outline-danger task-delete-btn" data-id="${task.id}">Delete</button>
      </div>
    </div>
  `;
}

function renderQuadrant(mountId, tasks) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
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

    document.querySelectorAll('.task-view-btn').forEach(btn => {
        btn.addEventListener('click', () => openViewModal(btn.dataset.id));
    });

    document.querySelectorAll('.task-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => openModal(btn.dataset.id));
    });

    document.querySelectorAll('.task-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ok = await confirmAction('Move this task to the bin?');
            if (!ok) return;
            try {
                await apiFetch(`/tasks/${btn.dataset.id}`, { method: 'DELETE' });
                showToast('Task moved to bin', 'success');
                await loadTasks();
            } catch (err) {
                showToast('Failed to delete task: ' + err.message);
            }
        });
    });
}

function isoToLocalInput(isoString) {
    if (!isoString) return '';
    return isoString.slice(0, 16);
}

function localInputToISO(localString) {
    if (!localString) return null;
    return new Date(localString).toISOString();
}

function openModal(taskId) {
    const form = document.getElementById('taskForm');
    form.reset();
    document.getElementById('taskId').value = '';
    document.getElementById('taskModalLabel').textContent = taskId ? 'Edit Task' : 'New Task';

    if (taskId) {
        const task = allTasks.find(t => t.id === taskId);
        if (task) {
            document.getElementById('taskId').value = task.id;
            document.getElementById('taskTitle').value = task.title;
            document.getElementById('taskDescription').value = task.description ?? '';
            document.getElementById('taskDueAt').value = isoToLocalInput(task.due_at);
            document.getElementById('taskUrgent').checked = task.urgent;
            document.getElementById('taskImportant').checked = task.important;
        }
    }

    modal.show();
}

function openViewModal(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('viewTaskTitle').textContent = task.title;
    document.getElementById('viewTaskDue').textContent = task.due_at ? formatDateTime(task.due_at, timeZone) : 'No due date';
    document.getElementById('viewTaskUrgent').textContent = task.urgent ? 'Yes' : 'No';
    document.getElementById('viewTaskImportant').textContent = task.important ? 'Yes' : 'No';
    document.getElementById('viewTaskStatus').textContent = task.status === 'done' ? 'Completed' : 'Pending';

    const descEl = document.getElementById('viewTaskDescription');
    if (task.description) {
        descEl.textContent = task.description;
        descEl.parentElement.classList.remove('d-none');
    } else {
        descEl.textContent = '';
        descEl.parentElement.classList.add('d-none');
    }

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
    showLoadingSkeletons();

    const layoutPromise = initLayout('tasks');
    const settingsPromise = fetchSettingsFast();
    const tasksPromise = loadTasks();

    modal = new bootstrap.Modal(document.getElementById('taskModal'));
    viewModal = new bootstrap.Modal(document.getElementById('viewTaskModal'));

    document.getElementById('addTaskBtn').addEventListener('click', () => openModal(null));
    document.getElementById('taskForm').addEventListener('submit', handleSubmit);

    try {
        const [layoutInfo, freshSettings] = await Promise.all([
            layoutPromise,
            settingsPromise,
            tasksPromise
        ]);
        if (!layoutInfo) return;

        if (freshSettings?.timezone && freshSettings.timezone !== timeZone) {
            timeZone = freshSettings.timezone;
            render();
        }
    } catch (err) {
        console.error('Failed to load tasks:', err);
        document.querySelector('.tasks-page').insertAdjacentHTML('beforeend',
            `<div class="alert alert-danger">Failed to load tasks: ${escapeHtml(err.message)}</div>`);
    }
}

main();