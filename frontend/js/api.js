// frontend/js/api.js
const API_BASE_URL = 'http://localhost:4000/api';

let refreshPromise = null; // shared in-flight refresh, prevents parallel-401 race

// Endpoints where a 401 is a NORMAL expected response (wrong password,
// duplicate signup email handled elsewhere, etc.) — NOT a sign the
// session expired. Only these are excluded from the auto-refresh-retry
// logic below; every other 401 is treated as "access token expired,
// try to refresh."
const AUTH_ENDPOINTS_NO_REFRESH = ['/auth/refresh', '/auth/login', '/auth/signup'];

// Computes the correct relative path from the current page to a
// top-level frontend file, regardless of whether the current page is
// at the frontend root (index.html itself) or one level down
// (pages/*.html) — a single hardcoded path can't be right for both,
// and being wrong here causes a 404 instead of an actual redirect.
function relativePagePath(filename) {
    return window.location.pathname.includes('/pages/') ? `../${filename}` : filename;
}

function loginPagePath() {
    return relativePagePath('index.html');
}

// The ONLY place the backend ever returns a 403 (see profileAccess.js
// resolveProfileIds) is when the cross-profile filter bar's persisted
// selection names a profile_id the user no longer owns — e.g. it was
// deleted in another tab/device while still selected here. The user's
// session is completely fine; the stale bit of state is this one
// localStorage key. So: clear it and retry once with the default
// scope, instead of yanking the user to a dead-end error page over a
// one-line fix.
let retriedAfterStaleProfileFilter = false;

export async function apiFetch(endpoint, options = {}) {
    const accessToken = localStorage.getItem('accessToken');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    let res = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });

    if (res.status === 401 && !AUTH_ENDPOINTS_NO_REFRESH.includes(endpoint)) {
        const refreshed = await tryRefresh();
        if (!refreshed) {
            window.location.href = loginPagePath();
            return Promise.reject(new Error('Session expired'));
        }
        headers['Authorization'] = `Bearer ${localStorage.getItem('accessToken')}`;
        res = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
    }

    if (res.status === 403 && endpoint.includes('profile_ids=') && !retriedAfterStaleProfileFilter) {
        // Self-heal: drop the stale filter selection and retry once with
        // the default scope, rather than dead-ending on an error page for
        // what's really just leftover localStorage pointing at a profile
        // that's gone. See the comment above this flag's declaration.
        retriedAfterStaleProfileFilter = true;
        localStorage.removeItem('profileFilterSelection');
        const cleanEndpoint = endpoint.replace(/[?&]profile_ids=[^&]*/, '').replace(/^&/, '?');
        return apiFetch(cleanEndpoint, options);
    }

    if (res.status === 403) {
        // Anything else hitting this means a genuine, unexpected
        // forbidden — not the stale-filter case above (already handled).
        window.location.href = relativePagePath('403.html');
        return Promise.reject(new Error('Forbidden'));
    }

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed: ${res.status}`);
    }
    return res.status === 204 ? null : res.json();
}

async function tryRefresh() {
    if (refreshPromise) return refreshPromise; // reuse in-flight refresh if one's already running

    refreshPromise = (async () => {
        const rawRefreshToken = localStorage.getItem('refreshToken');
        if (!rawRefreshToken) return false;
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: rawRefreshToken }),
        });
        if (!res.ok) { localStorage.clear(); return false; }
        const data = await res.json();
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        return true;
    })();

    const result = await refreshPromise;
    refreshPromise = null; // clear so the next real token expiry triggers a fresh refresh
    return result;
}