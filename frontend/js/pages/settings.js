import { initLayout } from '../layout.js';
import { apiFetch } from '../api.js';
import { showToast } from '../toast.js';
import { resolveTheme } from '../themeUtils.js';

let renameProfileModal = null;
let deleteProfileModal = null;
let profileToRenameId = null;
let profileToDeleteId = null;

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

function populateTimezoneSelect(currentTimezone) {
    const select = document.getElementById('timezoneSelect');
    const zones = Intl.supportedValuesOf('timeZone');
    select.innerHTML = zones
        .map(z => `<option value="${z}"${z === currentTimezone ? ' selected' : ''}>${z}</option>`)
        .join('');
}

async function loadSettings() {
    const { settings } = await apiFetch('/settings');
    populateTimezoneSelect(settings.timezone);
    document.getElementById('themeSelect').value = settings.theme;
    document.getElementById('weekStartSelect').value = String(settings.week_starts_on);
}

async function loadProfiles(currentProfileId) {
    const { profiles } = await apiFetch('/profiles');
    const mount = document.getElementById('profilesList');
    mount.innerHTML = profiles.map(p => `
    <div class="profile-list-item d-flex align-items-center justify-content-between">
      <div>
        <span>${escapeHtml(p.name)}</span>
        ${p.id === currentProfileId ? '<span class="text-muted ms-2">Active</span>' : ''}
      </div>
      <div class="btn-group btn-group-sm">
        ${p.id !== currentProfileId ? `
          <button type="button" class="btn btn-outline-secondary rename-profile-btn" data-profile-id="${p.id}" data-profile-name="${escapeHtml(p.name)}" title="Rename">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708z"/></svg>
          </button>
          <button type="button" class="btn btn-outline-danger delete-profile-btn" data-profile-id="${p.id}" data-profile-name="${escapeHtml(p.name)}" title="Delete">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');

    // Add event listeners for rename/delete buttons
    document.querySelectorAll('.rename-profile-btn').forEach(btn => {
        btn.addEventListener('click', handleRenameClick);
    });
    document.querySelectorAll('.delete-profile-btn').forEach(btn => {
        btn.addEventListener('click', handleDeleteClick);
    });
}

async function handleSubmit(e) {
    e.preventDefault();
    const payload = {
        timezone: document.getElementById('timezoneSelect').value,
        theme: document.getElementById('themeSelect').value,
        week_starts_on: Number(document.getElementById('weekStartSelect').value),
    };

    try {
        await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify(payload) });

        // Resolve the raw pref (light/dark/system) to an actual display value
        // before writing data-theme — CSS only matches "light"/"dark", so
        // writing "system" raw would fall back to the default until reload.
        // The RAW pref is still cached in localStorage for pre-paint theme reads.
        document.documentElement.setAttribute('data-theme', resolveTheme(payload.theme));
        localStorage.setItem('theme', payload.theme);

        const msg = document.getElementById('saveMsg');
        msg.classList.add('visible');
        setTimeout(() => msg.classList.remove('visible'), 2000);
    } catch (err) {
        showToast('Failed to save settings: ' + err.message);
    }
}

async function handleAddProfile(e) {
    e.preventDefault();
    const nameInput = document.getElementById('newProfileName');
    const name = nameInput.value.trim();
    if (!name) return;

    try {
        await apiFetch('/profiles', { method: 'POST', body: JSON.stringify({ name }) });
        nameInput.value = '';
        window.location.reload();
    } catch (err) {
        showToast('Failed to create profile: ' + err.message);
    }
}

function handleRenameClick(e) {
    const btn = e.currentTarget;
    profileToRenameId = btn.dataset.profileId;
    const currentName = btn.dataset.profileName;

    if (!renameProfileModal) {
        renameProfileModal = new bootstrap.Modal(document.getElementById('renameProfileModal'));
    }

    document.getElementById('renameProfileId').value = profileToRenameId;
    document.getElementById('renameProfileName').value = currentName;
    renameProfileModal.show();
}

function handleDeleteClick(e) {
    const btn = e.currentTarget;
    profileToDeleteId = btn.dataset.profileId;
    const currentName = btn.dataset.profileName;

    if (!deleteProfileModal) {
        deleteProfileModal = new bootstrap.Modal(document.getElementById('deleteProfileModal'));
    }

    document.getElementById('deleteProfileName').textContent = currentName;
    deleteProfileModal.show();
}

async function handleRenameConfirm() {
    if (!profileToRenameId) return;

    const newName = document.getElementById('renameProfileName').value.trim();
    if (!newName) {
        showToast('Profile name is required.');
        return;
    }

    try {
        await apiFetch(`/profiles/${profileToRenameId}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: newName })
        });
        renameProfileModal.hide();
        window.location.reload();
    } catch (err) {
        showToast('Failed to rename profile: ' + err.message);
    }
}

async function handleDeleteConfirm() {
    if (!profileToDeleteId) return;

    try {
        await apiFetch(`/profiles/${profileToDeleteId}`, { method: 'DELETE' });
        deleteProfileModal.hide();
        window.location.reload();
    } catch (err) {
        showToast('Failed to delete profile: ' + err.message);
    }
}

async function main() {
    const layoutInfo = await initLayout('settings');
    if (!layoutInfo) return;

    document.getElementById('settingsForm').addEventListener('submit', handleSubmit);
    document.getElementById('addProfileForm').addEventListener('submit', handleAddProfile);
    document.getElementById('confirmRenameBtn').addEventListener('click', handleRenameConfirm);
    document.getElementById('confirmDeleteBtn').addEventListener('click', handleDeleteConfirm);

    try {
        await loadSettings();
        await loadProfiles(layoutInfo.profileId);
    } catch (err) {
        console.error('Failed to load settings:', err);
        document.querySelector('.settings-page').insertAdjacentHTML('beforeend',
            `<div class="alert alert-danger">Failed to load settings: ${escapeHtml(err.message)}</div>`);
    }
}

main();