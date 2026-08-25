import { apiFetch } from './api.js';
import { showToast } from './toast.js';
import { initAiOverlay } from './aiOverlay.js';

const NAV_ITEMS = [
    { label: 'Dashboard', href: 'dashboard.html', page: 'dashboard' },
    { label: 'Tasks', href: 'tasks.html', page: 'tasks' },
    { label: 'Notes', href: 'notes.html', page: 'notes' },
    { label: 'Habits', href: 'habits.html', page: 'habits' },
    { label: 'Calendar', href: 'calendar.html', page: 'calendar' },
    { label: 'Reminders', href: 'reminders.html', page: 'reminders' },
    { label: 'Bin', href: 'bin.html', page: 'bin' },
    { label: 'Settings', href: 'settings.html', page: 'settings' },
];

function decodeAccessToken() {
    const token = localStorage.getItem('accessToken');
    if (!token) return null;
    try {
        const payload = token.split('.')[1];
        const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
        return JSON.parse(json);
    } catch {
        return null;
    }
}

function requireAuthGuard() {
    const token = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');
    if (!token || !refreshToken) {
        window.location.href = '../index.html';
        return false;
    }
    return true;
}

function renderNavHTML(activePage, userRole, impersonatedBy, mustResetPassword) {
    if (mustResetPassword) {
        return `
        <div class="impersonation-banner" style="background: var(--sb-accent-orange); color: #FFFFFF;">
          <span>⚠️ <strong>Mandatory Password Reset:</strong> You must set a new password before accessing the system.</span>
        </div>
        <nav class="navbar navbar-expand-lg app-navbar">
          <div class="container-fluid">
            <span class="navbar-brand app-wordmark">
              <img src="/assets/favicon.svg" class="app-brand-logo" alt="Logo" />
              Second<span>Brain</span>
            </span>
            <div class="d-flex align-items-center gap-2 nav-controls ms-auto">
              <button id="logoutBtn" class="btn btn-sm btn-outline-danger text-nowrap" type="button">Log out</button>
            </div>
          </div>
        </nav>
      `;
    }

    const navItems = [...NAV_ITEMS];
    if (userRole === 'ADMIN') {
        navItems.push({ label: 'Admin ⚡', href: 'admin.html', page: 'admin' });
    }

    const links = navItems.map(item => `
    <li class="nav-item">
      <a class="nav-link${item.page === activePage ? ' active' : ''}" href="${item.href}">${item.label}</a>
    </li>
  `).join('');

    const impersonationBanner = (impersonatedBy || sessionStorage.getItem('sb_admin_backup_access')) ? `
      <div class="impersonation-banner" id="impersonationBanner">
        <span>⚠️ <strong>Impersonation Active:</strong> You are browsing the app as another user.</span>
        <button type="button" class="impersonation-exit-btn" id="exitImpersonationBtn">Exit Impersonation &rarr;</button>
      </div>
    ` : '';

    return `
    ${impersonationBanner}
    <nav class="navbar navbar-expand-lg app-navbar">
      <div class="container-fluid">
        <a class="navbar-brand app-wordmark" href="dashboard.html">
          <img src="/assets/favicon.svg" class="app-brand-logo" alt="Logo" />
          Second<span>Brain</span>
        </a>

        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#appNavCollapse">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="appNavCollapse">
          <ul class="navbar-nav me-auto mb-2 mb-lg-0">${links}</ul>
          <div class="d-flex align-items-center gap-2 nav-controls">
            <select id="profileSwitcher" class="form-select form-select-sm app-profile-select" aria-label="Active profile"></select>
            <button id="logoutBtn" class="btn btn-sm btn-outline-danger text-nowrap" type="button">Log out</button>
          </div>
        </div>
      </div>
    </nav>
  `;
}

export function getCachedSettings() {
    try {
        const saved = localStorage.getItem('sb_cached_settings');
        if (saved) return JSON.parse(saved);
    } catch {}
    return { timezone: 'UTC', week_starts_on: 0 };
}

export async function fetchSettingsFast() {
    try {
        const { settings } = await apiFetch('/settings');
        localStorage.setItem('sb_cached_settings', JSON.stringify(settings));
        return settings;
    } catch (err) {
        return getCachedSettings();
    }
}

function renderProfileOptions(profiles, currentProfileId) {
    return profiles
        .map(p => `<option value="${p.id}"${p.id === currentProfileId ? ' selected' : ''}>${p.name}</option>`)
        .join('');
}

async function populateProfileSwitcher(currentProfileId) {
    const select = document.getElementById('profileSwitcher');
    if (!select) return;

    // Fast-render cached profiles instantly if available
    try {
        const cached = localStorage.getItem('sb_cached_profiles');
        if (cached) {
            const profiles = JSON.parse(cached);
            select.innerHTML = renderProfileOptions(profiles, currentProfileId);
        }
    } catch {}

    // Background fetch to keep profiles fresh
    apiFetch('/profiles')
        .then(({ profiles }) => {
            localStorage.setItem('sb_cached_profiles', JSON.stringify(profiles));
            select.innerHTML = renderProfileOptions(profiles, currentProfileId);
        })
        .catch(err => {
            console.error('Failed to load profiles:', err);
        });

    select.addEventListener('change', async () => {
        const newProfileId = select.value;
        if (newProfileId === currentProfileId) return;

        try {
            const data = await apiFetch(`/profiles/${newProfileId}/select`, { method: 'POST' });
            localStorage.setItem('accessToken', data.accessToken);
            localStorage.setItem('refreshToken', data.refreshToken);
            window.location.reload();
        } catch (err) {
            showToast('Failed to switch profile: ' + err.message);
        }
    });
}

function initLogout() {
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        const refreshToken = localStorage.getItem('refreshToken');
        try {
            await apiFetch('/auth/logout', {
                method: 'POST',
                body: JSON.stringify({ refreshToken }),
            });
        } catch (err) {
            console.error('Logout request failed, clearing local session anyway:', err);
        } finally {
            localStorage.clear();
            localStorage.setItem('theme', 'light');
            window.location.href = '../index.html';
        }
    });
}

export async function initLayout(activePage) {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('theme', 'light');

    if (!requireAuthGuard()) return null;

    const payload = decodeAccessToken();
    const profileId = payload?.profile_id ?? null;
    const userRole = payload?.role ?? 'USER';
    const impersonatedBy = payload?.impersonated_by ?? null;
    const mustResetPassword = Boolean(payload?.must_reset_password);

    // Mandatory Reset Enforcement: Lock user to change-password.html
    if (mustResetPassword && activePage !== 'change-password') {
        window.location.href = 'change-password.html';
        return null;
    }

    const mount = document.getElementById('app-nav');
    if (!mount) {
        console.error('layout.js: no #app-nav element found on this page.');
        return null;
    }
    mount.innerHTML = renderNavHTML(activePage, userRole, impersonatedBy, mustResetPassword);

    const exitBtn = document.getElementById('exitImpersonationBtn');
    if (exitBtn) {
        exitBtn.addEventListener('click', () => {
            const adminAccess = sessionStorage.getItem('sb_admin_backup_access');
            const adminRefresh = sessionStorage.getItem('sb_admin_backup_refresh');
            if (adminAccess) {
                localStorage.setItem('accessToken', adminAccess);
                if (adminRefresh) localStorage.setItem('refreshToken', adminRefresh);
                sessionStorage.removeItem('sb_admin_backup_access');
                sessionStorage.removeItem('sb_admin_backup_refresh');
                localStorage.removeItem('sb_cached_settings');
                localStorage.removeItem('sb_cached_profiles');
                window.location.href = 'admin.html';
            } else {
                window.location.href = 'admin.html';
            }
        });
    }

    if (!mustResetPassword) {
        populateProfileSwitcher(profileId);
    }
    initLogout();
    initAiOverlay();

    return { profileId, mustResetPassword };
}

export const renderNav = initLayout;