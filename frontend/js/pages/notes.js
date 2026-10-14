import { initLayout } from '../layout.js';
import { apiFetch } from '../api.js';
import { showToast } from '../toast.js';
import { confirmAction } from '../confirmDialog.js';
import { initProfileFilter } from '../profileFilter.js';
import { formatDateTimeWithTZ } from '../timeUtils.js';
import { escapeHtml, renderProfileBadge as renderBadgeMarkup, shouldShowProfileBadge } from '../utils.js';
import { renderProfileTargetSelect, bindProfileTargetSelect, getProfileTargetPayload, getActiveProfileId } from '../profileTargetSelect.js?v=2';

function parseTags(input) {
    return input.split(',').map(t => t.trim()).filter(Boolean);
}

function localInputToISO(value) {
    if (!value) return null;
    return new Date(value).toISOString();
}

let timeZone = 'UTC';
let viewModal = null;
let editModal = null;
let convertModal = null;
let allNotes = [];
let currentProfileFilter = null;
let profilesCache = [];

function renderProfileBadge(item) {
    const showBadge = shouldShowProfileBadge(
        currentProfileFilter,
        profilesCache,
        allNotes.map(n => n.profile_id)
    ) && item.profile_id;
    if (!showBadge) return '';
    return renderBadgeMarkup(profilesCache.find(p => p.id === item.profile_id));
}


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
      ${tagsHTML}
      <div class="note-footer">
        ${convertedHTML}${renderProfileBadge(note)}
        <div class="note-actions">
          <button class="btn btn-outline-secondary note-view-btn" data-id="${note.id}">View</button>
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
    let url = '/notes';
    const queryParts = [];

    if (tags.length) {
        queryParts.push(`tags=${encodeURIComponent(tags.join(','))}`);
    }
    if (currentProfileFilter === 'all') {
        queryParts.push('profile_ids=all');
    } else if (Array.isArray(currentProfileFilter) && currentProfileFilter.length > 0) {
        queryParts.push(`profile_ids=${currentProfileFilter.join(',')}`);
    }

    if (queryParts.length > 0) {
        url += '?' + queryParts.join('&');
    }

    const { notes } = await apiFetch(url);
    allNotes = notes;

    // Always fetch profiles so the dropdown works even if list is empty
    try {
        const { profiles } = await apiFetch('/profiles');
        profilesCache = profiles;
    } catch (err) {
        console.error('Failed to load profiles:', err);
        profilesCache = [];
    }

    const captureContainer = document.getElementById('captureProfileTargetContainer');
    captureContainer.innerHTML = renderProfileTargetSelect(profilesCache, getActiveProfileId());
    bindProfileTargetSelect(captureContainer);

    render();
}

function wireItemEvents() {
    document.querySelectorAll('.note-view-btn').forEach(btn => {
        btn.addEventListener('click', () => openViewModal(btn.dataset.id));
    });

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
}

async function openViewModal(noteId) {
    if (!viewModal) {
        const viewModalEl = document.getElementById('viewNoteModal');
        viewModal = new bootstrap.Modal(viewModalEl);
    }

    const note = allNotes.find(n => n.id === noteId);
    if (!note) return;

    // Content
    const contentEl = document.getElementById('viewNoteContent');
    contentEl.textContent = note.content;

    // Profile badge
    const badgeEl = document.getElementById('viewNoteProfileBadge');
    badgeEl.innerHTML = renderProfileBadge(note);

    // Creation date with timezone
    const dateEl = document.getElementById('viewNoteDate');
    const profile = profilesCache.find(p => p.id === note.profile_id);
    const itemTz = profile?.timezone || note.profile_timezone;
    if (note.created_at) {
        dateEl.textContent = 'Created ' + formatDateTimeWithTZ(note.created_at, timeZone, itemTz);
    } else {
        dateEl.textContent = '';
    }

    // Tags
    const tagsGroupEl = document.getElementById('viewNoteTagsGroup');
    const tagsEl = document.getElementById('viewNoteTags');
    if (note.tags && note.tags.length > 0) {
        tagsGroupEl.classList.remove('d-none');
        tagsEl.innerHTML = `<div class="note-tags">${note.tags.map(t => `<span class="note-tag">${escapeHtml(t)}</span>`).join('')}</div>`;
    } else {
        tagsGroupEl.classList.add('d-none');
        tagsEl.innerHTML = '';
    }

    // Status & convert button
    const statusContainer = document.getElementById('viewNoteStatusContainer');
    const convertBtn = document.getElementById('viewNoteConvertBtn');
    if (note.converted_task_id) {
        statusContainer.innerHTML = `<span class="note-converted-badge">✓ Converted to task</span>`;
        convertBtn.classList.add('d-none');
    } else {
        statusContainer.innerHTML = '';
        convertBtn.classList.remove('d-none');
        convertBtn.onclick = () => {
            viewModal.hide();
            openConvertModal(note.id, note.content);
        };
    }

    // Edit button: closes view modal and opens edit modal
    const editBtn = document.getElementById('viewNoteEditBtn');
    editBtn.onclick = () => {
        viewModal.hide();
        openEditModal(note.id);
    };

    viewModal.show();
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

    const convertContainer = document.getElementById('convertProfileTargetContainer');
    convertContainer.innerHTML = renderProfileTargetSelect(profilesCache, note.profile_id);
    bindProfileTargetSelect(convertContainer);

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
    const note = allNotes.find(n => n.id === noteId);
    if (!note) return;
    const { payload: targetPayload, targetName, isDifferent } = getProfileTargetPayload(document.getElementById('convertNoteForm'), profilesCache, note.profile_id);

    const payload = {
        title,
        description: document.getElementById('convertTaskDescription').value.trim(),
        urgent: document.getElementById('convertTaskUrgent').checked,
        important: document.getElementById('convertTaskImportant').checked,
        due_at: localInputToISO(document.getElementById('convertTaskDueAt').value),
        ...targetPayload
    };

    try {
        await apiFetch(`/notes/${noteId}/convert`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        convertModal.hide();
        if (isDifferent) {
            showToast(`Task created in ${targetName}`, 'success');
        } else {
            showToast('Converted to task', 'success');
        }
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
    const { payload: targetPayload, targetName, isDifferent } = getProfileTargetPayload(document.getElementById('captureForm'), profilesCache, getActiveProfileId());

    try {
        await apiFetch('/notes', { method: 'POST', body: JSON.stringify({ content, tags, ...targetPayload }) });
        document.getElementById('captureForm').reset();
        if (isDifferent) {
            showToast(`Note captured in ${targetName}`, 'success');
        } else {
            showToast('Note captured', 'success');
        }
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

    try {
        const { settings } = await apiFetch('/settings');
        timeZone = settings.timezone;
    } catch (err) {
        console.error('Failed to load settings, defaulting note times to UTC:', err);
    }

    // Initialize profile filter
    await initProfileFilter((profileIds) => {
        currentProfileFilter = profileIds;
        loadNotes(currentFilterTags());
    });

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