import { initLayout } from '../layout.js';
import { apiFetch } from '../api.js';
import { showToast } from '../toast.js';
import { confirmAction } from '../confirmDialog.js';

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

function parseTags(input) {
    return input.split(',').map(t => t.trim()).filter(Boolean);
}

function localInputToISO(value) {
    if (!value) return null;
    return new Date(value).toISOString();
}

let editModal = null;
let convertModal = null;
let allNotes = [];

function renderNote(note) {
    const tagsHTML = note.tags.length
        ? `<div class="note-tags">${note.tags.map(t => `<span class="note-tag">${escapeHtml(t)}</span>`).join('')}</div>`
        : '';

    const convertedHTML = note.converted_task_id
        ? `<span class="note-converted-badge">✓ Converted to task</span>`
        : `<button class="btn btn-outline-primary btn-sm note-convert-btn" data-id="${note.id}" data-content="${escapeHtml(note.content)}">Convert to Task</button>`;

    return `
    <div class="note-card" data-note-id="${note.id}">
      <div class="note-content" id="content-${note.id}">${escapeHtml(note.content)}</div>
      <button type="button" class="btn btn-link btn-sm p-0 note-toggle-btn d-none"
              data-target="content-${note.id}" aria-expanded="false">Show more</button>
      ${tagsHTML}
      <div class="note-footer">
        ${convertedHTML}
        <div class="note-actions">
          <button class="btn btn-outline-secondary note-edit-btn" data-id="${note.id}">Edit</button>
          <button class="btn btn-outline-danger note-delete-btn" data-id="${note.id}">Delete</button>
        </div>
      </div>
    </div>
  `;
}

function render() {
    const mount = document.getElementById('notesList');
    mount.innerHTML = allNotes.length === 0
        ? '<div class="dash-empty">No notes yet.</div>'
        : allNotes.map(renderNote).join('');
    wireItemEvents();
}

async function loadNotes(tags = []) {
    const query = tags.length ? `?tags=${encodeURIComponent(tags.join(','))}` : '';
    const { notes } = await apiFetch(`/notes${query}`);
    allNotes = notes;
    render();
}

function wireItemEvents() {
    document.querySelectorAll('.note-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });

    document.querySelectorAll('.note-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ok = await confirmAction('Move this note to Bin?');
            if (!ok) return;
            try {
                await apiFetch(`/notes/${btn.dataset.id}`, { method: 'DELETE' });
                showToast('Note moved to Bin', 'success');
                await loadNotes(currentFilterTags());
            } catch (err) {
                showToast('Failed to delete note: ' + err.message);
            }
        });
    });

    document.querySelectorAll('.note-convert-btn').forEach(btn => {
        btn.addEventListener('click', () => openConvertModal(btn.dataset.id, btn.dataset.content));
    });

    // Keyboard-accessible expand/collapse — a real <button>, not a click
    // handler on the text itself, so Tab/Enter/Space work and screen
    // readers get a proper aria-expanded announcement.
    document.querySelectorAll('.note-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const contentEl = document.getElementById(btn.dataset.target);
            const isExpanded = contentEl.classList.toggle('expanded');
            btn.setAttribute('aria-expanded', String(isExpanded));
            btn.textContent = isExpanded ? 'Show less' : 'Show more';
        });
    });

    updateNoteToggleVisibility();
}

// Only show "Show more" on notes that are ACTUALLY clamped — a short
// note doesn't need a toggle button that does nothing. Must run after
// the DOM has actually laid out the clamped text (requestAnimationFrame
// waits for the next paint), or scrollHeight/clientHeight would still
// reflect the pre-render state.
function updateNoteToggleVisibility() {
    requestAnimationFrame(() => {
        document.querySelectorAll('.note-content').forEach(contentEl => {
            const toggleBtn = document.querySelector(`.note-toggle-btn[data-target="${contentEl.id}"]`);
            if (!toggleBtn) return;
            const isTruncated = contentEl.scrollHeight > contentEl.clientHeight + 1; // +1 guards against sub-pixel rounding
            toggleBtn.classList.toggle('d-none', !isTruncated);
        });
    });
}

function openEditModal(noteId) {
    if (!editModal) {
        const editModalEl = document.getElementById('noteModal');
        editModal = new bootstrap.Modal(editModalEl);
    }
    const note = allNotes.find(n => n.id === noteId);
    if (!note) return;
    document.getElementById('editNoteId').value = note.id;
    document.getElementById('editNoteContent').value = note.content;
    document.getElementById('editNoteTags').value = note.tags.join(', ');
    editModal.show();
}

function openConvertModal(noteId, noteContent) {
    if (!convertModal) {
        const convertModalEl = document.getElementById('convertNoteModal');
        convertModal = new bootstrap.Modal(convertModalEl);
    }
    const note = allNotes.find(n => n.id === noteId);
    if (!note) return;

    // Use full note content as description, leave title empty for user to enter
    document.getElementById('convertNoteId').value = noteId;
    document.getElementById('convertTaskTitle').value = '';
    document.getElementById('convertTaskDescription').value = note.content;
    document.getElementById('convertTaskDueAt').value = '';
    document.getElementById('convertTaskUrgent').checked = false;
    document.getElementById('convertTaskImportant').checked = false;

    convertModal.show();
}

async function handleConvertSubmit(e) {
    e.preventDefault();

    const noteId = document.getElementById('convertNoteId').value;
    const title = document.getElementById('convertTaskTitle').value.trim();
    if (!title) {
        showToast('Task title is required');
        return;
    }
    const payload = {
        title,
        description: document.getElementById('convertTaskDescription').value.trim(),
        urgent: document.getElementById('convertTaskUrgent').checked,
        important: document.getElementById('convertTaskImportant').checked,
        due_at: localInputToISO(document.getElementById('convertTaskDueAt').value),
    };

    try {
        await apiFetch(`/notes/${noteId}/convert`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        convertModal.hide();
        showToast('Converted to task', 'success');
        await loadNotes(currentFilterTags());
    } catch (err) {
        // 409 = already converted (e.g. by another tab) — refresh to show the real state
        showToast(err.message);
        await loadNotes(currentFilterTags());
    }
}

async function handleEditSubmit(e) {
    e.preventDefault();
    const noteId = document.getElementById('editNoteId').value;
    const payload = {
        content: document.getElementById('editNoteContent').value.trim(),
        tags: parseTags(document.getElementById('editNoteTags').value),
    };
    try {
        await apiFetch(`/notes/${noteId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        editModal.hide();
        showToast('Note saved', 'success');
        await loadNotes(currentFilterTags());
    } catch (err) {
        showToast('Failed to save note: ' + err.message);
    }
}

async function handleCaptureSubmit(e) {
    e.preventDefault();
    const content = document.getElementById('captureContent').value.trim();
    const tags = parseTags(document.getElementById('captureTags').value);

    try {
        await apiFetch('/notes', { method: 'POST', body: JSON.stringify({ content, tags }) });
        document.getElementById('captureForm').reset();
        showToast('Note captured', 'success');
        await loadNotes(currentFilterTags());
    } catch (err) {
        showToast('Failed to save note: ' + err.message);
    }
}

function currentFilterTags() {
    return parseTags(document.getElementById('tagFilter').value);
}

async function main() {
    const layoutInfo = await initLayout('notes');
    if (!layoutInfo) return;

    document.getElementById('captureForm').addEventListener('submit', handleCaptureSubmit);
    document.getElementById('editNoteForm').addEventListener('submit', handleEditSubmit);
    document.getElementById('convertNoteForm').addEventListener('submit', handleConvertSubmit);
    document.getElementById('applyFilterBtn').addEventListener('click', () => loadNotes(currentFilterTags()));
    document.getElementById('clearFilterBtn').addEventListener('click', () => {
        document.getElementById('tagFilter').value = '';
        loadNotes();
    });

    try {
        await loadNotes();
    } catch (err) {
        console.error('Failed to load notes:', err);
        document.querySelector('.notes-page').insertAdjacentHTML('beforeend',
            `<div class="alert alert-danger">Failed to load notes: ${escapeHtml(err.message)}</div>`);
    }
}

main();