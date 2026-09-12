import { initLayout } from '../layout.js';
import { apiFetch } from '../api.js';
import { showToast } from '../toast.js';
import { applyTheme } from '../themeUtils.js';
import { getOffsetMinutes } from '../timeUtils.js';
import { getTimezoneDisplayLabel, getFriendlyTimezoneName, normalizeTimezone } from '../timezoneNames.js';
import { escapeHtml } from '../utils.js';

let renameProfileModal = null;
let deleteProfileModal = null;
let profileToRenameId = null;
let profileToDeleteId = null;
let profileToDeleteName = null;

function getOffsetMinutesValue(timezone) {
    return getOffsetMinutes(new Date(), timezone);
}

function formatOffsetString(offsetMinutes) {
    const roundedMinutes = Math.round(offsetMinutes);
    const sign = roundedMinutes >= 0 ? '+' : '-';
    const absMinutes = Math.abs(roundedMinutes);
    const hours = Math.floor(absMinutes / 60);
    const minutes = absMinutes % 60;
    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function populateTimezoneSelect(currentTimezone) {
    const select = document.getElementById('timezoneSelect');
    const rawZones = Array.from(Intl.supportedValuesOf('timeZone'));

    const normalizedCurrent = normalizeTimezone(currentTimezone);

    // Normalize all zones and ensure modern canonical zones are present
    const normalizedZones = rawZones.map(z => normalizeTimezone(z));
    if (normalizedCurrent) {
        normalizedZones.push(normalizedCurrent);
    }
    normalizedZones.push('Asia/Kolkata');

    // Deduplicate unique IANA zone identifiers
    const uniqueZones = Array.from(new Set(normalizedZones));

    // Sort zones by GMT offset ascending, then by friendly label alphabetically
    const zonesWithOffset = uniqueZones.map(z => {
        const offset = getOffsetMinutesValue(z);
        const offsetStr = formatOffsetString(offset);
        // Use friendly name + IANA + offset for display
        const label = getTimezoneDisplayLabel(z, offsetStr);
        return { zone: z, offset, label, friendly: getFriendlyTimezoneName(z) };
    }).sort((a, b) => a.offset - b.offset || a.friendly.localeCompare(b.friendly));

    select.innerHTML = zonesWithOffset
        .map(({ zone, label }) => {
            return `<option value="${zone}"${zone === normalizedCurrent ? ' selected' : ''}>${escapeHtml(label)}</option>`;
        })
        .join('');
}

function getBrowserTimezone() {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const validTimezones = Intl.supportedValuesOf('timeZone');
        if (validTimezones.includes(tz)) {
            return normalizeTimezone(tz);
        }
    } catch (e) {
        // Ignore errors, fallback to default
    }
    return null;
}

/**
 * Check if the user's current timezone is the default (Asia/Kolkata),
 * suggesting they haven't customized it yet.
 * @param {string} timezone - Current saved timezone
 * @returns {boolean} True if using default timezone
 */
function isDefaultTimezone(timezone) {
    return normalizeTimezone(timezone) === 'Asia/Kolkata';
}

async function loadSettings() {
    const { settings, user } = await apiFetch('/settings');

    // Populate email (read-only) and username fields
    document.getElementById('emailDisplay').value = user.email || '';
    currentUsername = user.username || '';
    renderUsernameDisplayMode();

    // Always use the saved timezone as the selected value
    const savedTimezone = normalizeTimezone(settings.timezone);
    populateTimezoneSelect(savedTimezone);
    updateTimezoneOffsetDisplay(savedTimezone);

    // If saved timezone is the default, check for browser detection
    // and show a non-intrusive suggestion (user must explicitly accept)
    if (isDefaultTimezone(savedTimezone)) {
        const browserTZ = getBrowserTimezone();
        if (browserTZ && !isDefaultTimezone(browserTZ)) {
            showTimezoneSuggestion(browserTZ);
        }
    }

    // Update offset display when user changes timezone selection
    document.getElementById('timezoneSelect').addEventListener('change', (e) => {
        updateTimezoneOffsetDisplay(e.target.value);
    });

    const themeEl = document.getElementById('themeSelect');
    if (themeEl) themeEl.value = settings.theme;
    document.getElementById('weekStartSelect').value = String(settings.week_starts_on);
}

function showTimezoneSuggestion(detectedTimezone) {
    const offsetStr = formatOffsetString(getOffsetMinutesValue(detectedTimezone));
    const friendlyName = getTimezoneDisplayLabel(detectedTimezone, offsetStr);
    const suggestionHtml = `
        <div class="alert alert-info alert-dismissible fade show mt-2" role="alert" id="tzSuggestion">
            <strong>Detected timezone:</strong> ${escapeHtml(friendlyName)}
            <button type="button" class="btn btn-sm btn-outline-primary ms-2" id="useDetectedTz">
                Use this timezone
            </button>
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Dismiss"></button>
        </div>
    `;
    const form = document.getElementById('settingsForm');
    form.insertAdjacentHTML('afterbegin', suggestionHtml);

    document.getElementById('useDetectedTz').addEventListener('click', () => {
        const select = document.getElementById('timezoneSelect');
        select.value = detectedTimezone;
        updateTimezoneOffsetDisplay(detectedTimezone);
        const alert = document.getElementById('tzSuggestion');
        if (alert) alert.remove();
    });
}

function updateTimezoneOffsetDisplay(timezone) {
    const offsetDisplay = document.getElementById('timezoneOffsetDisplay');
    if (offsetDisplay) {
        const offsetMinutes = getOffsetMinutesValue(timezone);
        const offsetStr = formatOffsetString(offsetMinutes);
        offsetDisplay.textContent = `Current offset: ${offsetStr}`;
    }
}

async function loadProfiles(currentProfileId) {
    const { profiles } = await apiFetch('/profiles');
    const mount = document.getElementById('profilesList');
    mount.innerHTML = profiles.map(p => `
    <div class="profile-list-item d-flex align-items-center justify-content-between">
      <div>
        <span style="display:inline-flex;align-items:center;gap:0.4rem;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};border:1px solid var(--sb-border);"></span>
          ${escapeHtml(p.name)}
        </span>
        ${p.id === currentProfileId ? '<span class="text-muted ms-2">Active</span>' : ''}
      </div>
      <div class="btn-group btn-group-sm">
        <button type="button" class="btn btn-outline-secondary rename-profile-btn" data-profile-id="${p.id}" data-profile-name="${escapeHtml(p.name)}" data-profile-color="${p.color}" title="Rename">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708z"/></svg>
        </button>
        ${p.id !== currentProfileId ? `
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
    const themeEl = document.getElementById('themeSelect');
    const payload = {
        timezone: document.getElementById('timezoneSelect').value,
        week_starts_on: Number(document.getElementById('weekStartSelect').value),
    };
    if (themeEl) {
        payload.theme = themeEl.value;
    }

    try {
        await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify(payload) });

        // Resolve+apply happens in one shared place (themeUtils.js) so
        // this can't drift from the navbar's own theme control again —
        // that's exactly what caused the favicon-not-updating bug.
        applyTheme(payload.theme);

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

    // Auto-detect browser timezone for new profile
    const timezone = getBrowserTimezone();

    try {
        await apiFetch('/profiles', { method: 'POST', body: JSON.stringify({ name, timezone }) });
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
    const currentColor = btn.dataset.profileColor;

    if (!renameProfileModal) {
        renameProfileModal = new bootstrap.Modal(document.getElementById('renameProfileModal'));
    }

    document.getElementById('renameProfileId').value = profileToRenameId;
    document.getElementById('renameProfileName').value = currentName;
    document.getElementById('renameProfileColor').value = currentColor;
    document.getElementById('renameProfileColorHex').textContent = currentColor.toUpperCase();

    // Update hex display when color picker changes
    const colorInput = document.getElementById('renameProfileColor');
    colorInput.onchange = () => {
        document.getElementById('renameProfileColorHex').textContent = colorInput.value.toUpperCase();
    };

    renameProfileModal.show();
}

function handleDeleteClick(e) {
    const btn = e.currentTarget;
    profileToDeleteId = btn.dataset.profileId;
    profileToDeleteName = btn.dataset.profileName;

    if (!deleteProfileModal) {
        deleteProfileModal = new bootstrap.Modal(document.getElementById('deleteProfileModal'));
    }

    document.getElementById('deleteProfileName').textContent = profileToDeleteName;
    // Clear any leftover text from a previous attempt on a different
    // profile — otherwise a stale correct answer could sit in the box.
    document.getElementById('deleteConfirmInput').value = '';
    deleteProfileModal.show();
}

async function handleRenameConfirm() {
    if (!profileToRenameId) return;

    const newName = document.getElementById('renameProfileName').value.trim();
    if (!newName) {
        showToast('Profile name is required.');
        return;
    }

    const newColor = document.getElementById('renameProfileColor').value;

    try {
        await apiFetch(`/profiles/${profileToRenameId}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: newName, color: newColor })
        });
        renameProfileModal.hide();
        window.location.reload();
    } catch (err) {
        showToast('Failed to rename profile: ' + err.message);
    }
}

async function handleDeleteConfirm() {
    if (!profileToDeleteId) return;

    // The actual safeguard — this is what the "type to confirm" box was
    // supposed to do from the start. Exact, case-sensitive match, same
    // pattern GitHub uses for "type the repo name to confirm deletion".
    const typedName = document.getElementById('deleteConfirmInput').value;
    if (typedName !== profileToDeleteName) {
        showToast('Profile name does not match. Deletion cancelled.');
        return;
    }

    try {
        await apiFetch(`/profiles/${profileToDeleteId}`, { method: 'DELETE' });
        deleteProfileModal.hide();
        window.location.reload();
    } catch (err) {
        showToast('Failed to delete profile: ' + err.message);
    }
}

let currentUsername = '';

function renderUsernameDisplayMode() {
    const container = document.getElementById('usernameContainer');
    if (!container) return;
    const errorEl = document.getElementById('usernameError');
    if (errorEl) errorEl.style.display = 'none';

    container.innerHTML = `
        <span id="usernameDisplay" class="fw-semibold">${escapeHtml(currentUsername)}</span>
        <button type="button" class="btn btn-outline-secondary btn-sm p-1 d-inline-flex align-items-center" id="editUsernameBtn" title="Edit username" aria-label="Edit username">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708z"/></svg>
        </button>
    `;

    document.getElementById('editUsernameBtn').addEventListener('click', renderUsernameEditMode);
}

function renderUsernameEditMode() {
    const container = document.getElementById('usernameContainer');
    if (!container) return;
    container.innerHTML = `
        <input type="text" class="form-control form-control-sm" id="inlineUsernameInput" value="${escapeHtml(currentUsername)}" style="max-width: 220px;" autocomplete="off" />
        <button type="button" class="btn btn-sm btn-outline-success p-1 d-inline-flex align-items-center" id="confirmUsernameBtn" title="Save username" aria-label="Save" style="color: var(--sb-ok); border-color: var(--sb-ok);">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>
        </button>
        <button type="button" class="btn btn-sm btn-outline-secondary p-1 d-inline-flex align-items-center" id="cancelUsernameBtn" title="Cancel" aria-label="Cancel" style="color: var(--sb-muted); border-color: var(--sb-border);">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
        </button>
    `;

    const input = document.getElementById('inlineUsernameInput');
    input.focus();
    input.select();

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirmUsername();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            renderUsernameDisplayMode();
        }
    });

    document.getElementById('confirmUsernameBtn').addEventListener('click', handleConfirmUsername);
    document.getElementById('cancelUsernameBtn').addEventListener('click', () => {
        renderUsernameDisplayMode();
    });
}

async function handleConfirmUsername() {
    const input = document.getElementById('inlineUsernameInput');
    if (!input) return;
    const newUsername = input.value.trim();
    const errorEl = document.getElementById('usernameError');

    const confirmBtn = document.getElementById('confirmUsernameBtn');
    if (confirmBtn) confirmBtn.disabled = true;

    try {
        const res = await apiFetch('/auth/username', {
            method: 'PATCH',
            body: JSON.stringify({ username: newUsername }),
        });

        if (res.accessToken && res.refreshToken) {
            localStorage.setItem('accessToken', res.accessToken);
            localStorage.setItem('refreshToken', res.refreshToken);
        }

        const navUsername = document.querySelector('.nav-username');
        if (navUsername) {
            navUsername.textContent = `Hi, ${res.username}`;
        }

        currentUsername = res.username;
        if (errorEl) errorEl.style.display = 'none';
        renderUsernameDisplayMode();
        showToast('Username updated.', 'success');
    } catch (err) {
        if (errorEl) {
            errorEl.textContent = err.message;
            errorEl.style.display = 'block';
        }
        showToast(err.message);
        if (confirmBtn) confirmBtn.disabled = false;
        input.focus();
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