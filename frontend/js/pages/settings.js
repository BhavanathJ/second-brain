import { initLayout } from '../layout.js';
import { apiFetch } from '../api.js';
import { showToast } from '../toast.js';
import { resolveTheme } from '../themeUtils.js';
import { getOffsetMinutes } from '../timeUtils.js';
import { getTimezoneDisplayLabel, normalizeTimezone } from '../timezoneNames.js';

let renameProfileModal = null;
let deleteProfileModal = null;
let profileToRenameId = null;
let profileToDeleteId = null;
let profileToDeleteName = null;

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

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
        const label = getTimezoneDisplayLabel(z, offsetStr);
        return { zone: z, offset, label };
    }).sort((a, b) => a.offset - b.offset || a.label.localeCompare(b.label));

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

async function loadSettings() {
    const { settings } = await apiFetch('/settings');

    // Always use the saved timezone as the selected value
    const savedTimezone = normalizeTimezone(settings.timezone);
    populateTimezoneSelect(savedTimezone);
    updateTimezoneOffsetDisplay(savedTimezone);

    // If saved timezone is the default, check for browser detection
    // and show a non-intrusive suggestion (user must explicitly accept)
    if (savedTimezone === 'Asia/Kolkata') {
        const browserTZ = getBrowserTimezone();
        if (browserTZ && browserTZ !== 'Asia/Kolkata') {
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
    document.getElementById('designSystemSelect').value = settings.design_system || 'signal';
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
    const themeEl = document.getElementById('themeSelect');
    const payload = {
        timezone: document.getElementById('timezoneSelect').value,
        week_starts_on: Number(document.getElementById('weekStartSelect').value),
        design_system: document.getElementById('designSystemSelect').value,
    };
    if (themeEl) {
        payload.theme = themeEl.value;
    }

    try {
        await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify(payload) });

        // Resolve the raw pref (light/dark/system) to an actual display value
        // before writing data-theme — CSS only matches "light"/"dark", so
        // writing "system" raw would fall back to the default until reload.
        // The RAW pref is still cached in localStorage for pre-paint theme reads.
        document.documentElement.setAttribute('data-theme', resolveTheme(payload.theme));
        localStorage.setItem('theme', payload.theme);
        // Also persist and apply design system
        document.documentElement.setAttribute('data-design', payload.design_system);
        localStorage.setItem('design_system', payload.design_system);

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