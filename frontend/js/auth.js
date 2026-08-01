import { apiFetch } from './api.js';

// --- Tab switching ---
const tabs = document.querySelectorAll('.auth-tab');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');

tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');

        const isLogin = tab.dataset.tab === 'login';
        loginForm.classList.toggle('d-none', !isLogin);
        signupForm.classList.toggle('d-none', isLogin);
    });
});

// --- Shared: store tokens and go to the app ---
function handleAuthSuccess(data) {
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    window.location.href = 'pages/dashboard.html'; // doesn't exist yet — placeholder target
}

function showError(el, message) {
    el.textContent = message;
    el.classList.add('visible');
}

// --- Login ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('loginError');
    errorEl.classList.remove('visible');

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
        const data = await apiFetch('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
        handleAuthSuccess(data);
    } catch (err) {
        showError(errorEl, err.message || 'Login failed.');
    }
});

// --- Signup ---
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('signupError');
    errorEl.classList.remove('visible');

    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;

    try {
        const data = await apiFetch('/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
        handleAuthSuccess(data);
    } catch (err) {
        showError(errorEl, err.message || 'Signup failed.');
    }
});