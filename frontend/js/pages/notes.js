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

const editModalEl = document.getElementById('noteModal');
const editModal = new bootstrap.Modal(editModalEl);
let allNotes = [];

function renderNote(note) {
    const tagsHTML = note.tags.length
        ? `<div class="note-tags">${note.tags.map(t => `<span class="note-tag">${escapeHtml(t)}</span>`).join('')}</div>`
        : '';

    const convertedHTML = note.converted_task_id
        ? `<span class="note-converted-badge">✓ Converted to task</span>`
        : `<button class="btn btn-outline-primary btn-sm note-convert-btn" data-id="${note.id}">Convert to Task</button>`;

    return `
    <div class="note-card">
      <div class="note-content">${escapeHtml(note.content)}</div>
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
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
                await apiFetch(`/notes/${btn.dataset.id}/convert`, { method: 'POST' });
                showToast('Converted to task', 'success');
                await loadNotes(currentFilterTags());
            } catch (err) {
                // 409 = already converted (e.g. by another tab) — refresh to show the real state
                showToast(err.message);
                await loadNotes(currentFilterTags());
            }
        });
    });
}

function openEditModal(noteId) {
    const note = allNotes.find(n => n.id === noteId);
    if (!note) return;
    document.getElementById('editNoteId').value = note.id;
    document.getElementById('editNoteContent').value = note.content;
    document.getElementById('editNoteTags').value = note.tags.join(', ');
    editModal.show();
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