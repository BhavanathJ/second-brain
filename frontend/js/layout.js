import { apiFetch } from './api.js';

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

// Decodes the JWT payload WITHOUT verifying the signature — fine here,
// this is only ever used to read display info (which profile is active)
// from a token the browser already trusts because it just used it
// successfully. Never treat this as a security check.
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

function renderNavHTML(activePage) {
    const links = NAV_ITEMS.map(item => `
    <li class="nav-item">
      <a class="nav-link${item.page === activePage ? ' active' : ''}" href="${item.href}">${item.label}</a>
    </li>
  `).join('');

    return `
    <nav class="navbar navbar-expand-lg app-navbar">
      <div class="container-fluid">
        <a class="navbar-brand app-wordmark" href="dashboard.html">Second<span>Brain</span></a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#appNavCollapse">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="appNavCollapse">
          <ul class="navbar-nav me-auto mb-2 mb-lg-0">${links}</ul>
          <div class="d-flex align-items-center gap-2">
            <select id="profileSwitcher" class="form-select form-select-sm app-profile-select" aria-label="Active profile"></select>
            <button id="themeToggle" class="btn btn-sm btn-outline-secondary" type="button" title="Toggle theme">🌓</button>
            <button id="logoutBtn" class="btn btn-sm btn-outline-danger" type="button">Log out</button>
          </div>
        </div>
      </div>
    </nav>
  `;
}

async function populateProfileSwitcher(currentProfileId) {
    const select = document.getElementById('profileSwitcher');

    try {
        const { profiles } = await apiFetch('/profiles');
        select.innerHTML = profiles
            .map(p => `<option value="${p.id}"${p.id === currentProfileId ? ' selected' : ''}>${p.name}</option>`)
            .join('');
    } catch (err) {
        console.error('Failed to load profiles:', err);
    }

    select.addEventListener('change', async () => {
        const newProfileId = select.value;
        if (newProfileId === currentProfileId) return;

        try {
            const data = await apiFetch(`/profiles/${newProfileId}/select`, { method: 'POST' });
            localStorage.setItem('accessToken', data.accessToken);
            localStorage.setItem('refreshToken', data.refreshToken);
            window.location.reload(); // full reload — simplest way to refresh every profile-scoped view at once
        } catch (err) {
            alert('Failed to switch profile: ' + err.message);
        }
    });
}

// Applies theme to the DOM AND caches it in localStorage — the cache is
// what the inline <head> script reads on the NEXT page load, before
// this file even finishes loading, to avoid a flash of the wrong theme.
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
}

async function initThemeToggle() {
    const btn = document.getElementById('themeToggle');
    // Inline <head> script already applied the cached theme before paint —
    // this just keeps `currentTheme` in sync for the click handler below.
    let currentTheme = localStorage.getItem('theme') || 'light';

    try {
        const { settings } = await apiFetch('/settings');
        if (settings.theme !== currentTheme) {
            // Server disagrees with the cache (e.g. theme was changed on
            // another device/profile) — correct it, but this is now a rare
            // late correction, not the default first-load behavior.
            currentTheme = settings.theme;
            applyTheme(currentTheme);
        }
    } catch (err) {
        console.error('Failed to load settings for theme:', err);
    }

    btn.addEventListener('click', async () => {
        currentTheme = currentTheme === 'light' ? 'dark' : 'light';
        applyTheme(currentTheme);
        try {
            await apiFetch('/settings', {
                method: 'PATCH',
                body: JSON.stringify({ theme: currentTheme }),
            });
        } catch (err) {
            console.error('Failed to save theme:', err);
        }
    });
}

function initLogout() {
    document.getElementById('logoutBtn').addEventListener('click', async () => {
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
            window.location.href = '../index.html';
        }
    });
}

// Call once per page, right after DOM is ready. Requires a
// <div id="app-nav"></div> at the top of <body>.
// activePage matches one of NAV_ITEMS' `page` values, for highlighting.
export async function initLayout(activePage) {
    if (!requireAuthGuard()) return null;

    const payload = decodeAccessToken();
    const profileId = payload?.profile_id ?? null;

    const mount = document.getElementById('app-nav');
    if (!mount) {
        console.error('layout.js: no #app-nav element found on this page.');
        return null;
    }
    mount.innerHTML = renderNavHTML(activePage);

    await populateProfileSwitcher(profileId);
    await initThemeToggle();
    initLogout();

    return { profileId };
}