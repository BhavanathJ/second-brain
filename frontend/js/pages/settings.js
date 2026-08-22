import { initLayout } from '../layout.js';
import { apiFetch } from '../api.js';
import { showToast } from '../toast.js';

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
    document.getElementById('weekStartSelect').value = String(settings.week_starts_on);
}

async function loadProfiles(currentProfileId) {
    const { profiles } = await apiFetch('/profiles');
    const mount = document.getElementById('profilesList');
    mount.innerHTML = profiles.map(p => `
    <div class="profile-list-item">
      <span>${escapeHtml(p.name)}</span>
      ${p.id === currentProfileId ? '<span class="text-muted">Active</span>' : ''}
    </div>
  `).join('');
}

async function handleSubmit(e) {
    e.preventDefault();
    const payload = {
        timezone: document.getElementById('timezoneSelect').value,
        week_starts_on: Number(document.getElementById('weekStartSelect').value),
    };

    try {
        await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify(payload) });

        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');

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

async function main() {
    const layoutInfo = await initLayout('settings');
    if (!layoutInfo) return;

    document.getElementById('settingsForm').addEventListener('submit', handleSubmit);
    document.getElementById('addProfileForm').addEventListener('submit', handleAddProfile);

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