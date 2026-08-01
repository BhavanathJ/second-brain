// frontend/js/api.js
const API_BASE_URL = 'http://localhost:4000/api';

let refreshPromise = null; // shared in-flight refresh, prevents parallel-401 race

export async function apiFetch(endpoint, options = {}) {
    const accessToken = localStorage.getItem('accessToken');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    let res = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });

    if (res.status === 401 && endpoint !== '/auth/refresh') {
        const refreshed = await tryRefresh();
        if (!refreshed) {
            window.location.href = '/index.html';
            return Promise.reject(new Error('Session expired'));
        }
        headers['Authorization'] = `Bearer ${localStorage.getItem('accessToken')}`;
        res = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
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