import { apiFetch } from './api.js';

// --- Show/hide password toggles - works for any field via data-target ---
document.querySelectorAll('.toggle-password-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        const field = document.getElementById(btn.dataset.target);
        const isHidden = field.type === 'password';
        field.type = isHidden ? 'text' : 'password';
        btn.textContent = isHidden ? 'Hide' : 'Show';
    });
});

// --- Tab switching & Initial Setup Detection ---
const tabs = document.querySelectorAll('.auth-tab');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const firstRunBanner = document.getElementById('firstRunBanner');
const signupTabBtn = document.getElementById('signupTabBtn');
const loginTabBtn = document.getElementById('loginTabBtn');
const authSetupSubtitle = document.getElementById('authSetupSubtitle');

async function checkSystemSetupStatus() {
    try {
        const status = await apiFetch('/auth/setup-status');
        if (!status.initialized) {
            // First Run: Guide directly to Super Admin Registration
            if (firstRunBanner) firstRunBanner.classList.remove('d-none');
            if (authSetupSubtitle) authSetupSubtitle.textContent = 'System Initialization (First Run)';
            
            // Switch to Signup form by default
            tabs.forEach((t) => t.classList.remove('active'));
            if (signupTabBtn) {
                signupTabBtn.classList.add('active');
                signupTabBtn.textContent = '👑 Super Admin Setup';
            }
            if (loginTabBtn) {
                loginTabBtn.classList.add('d-none'); // Hide login on first run since no users exist
            }
            loginForm.classList.add('d-none');
            signupForm.classList.remove('d-none');

            const signupSubmitBtn = signupForm.querySelector('button[type="submit"]');
            if (signupSubmitBtn) {
                signupSubmitBtn.innerHTML = '&#9889; Create Super Admin Account';
            }
        } else {
            // System already initialized
            if (firstRunBanner) firstRunBanner.classList.add('d-none');
            if (authSetupSubtitle) authSetupSubtitle.textContent = '';
            if (loginTabBtn) loginTabBtn.classList.remove('d-none');

            const tabsContainer = document.getElementById('authTabsContainer');

            if (!status.selfSignupEnabled) {
                // Access Control: Self signup is disabled by Admin
                if (signupTabBtn) signupTabBtn.classList.add('d-none');
                if (tabsContainer) tabsContainer.classList.add('d-none'); // Clean single login view
                
                // Ensure login form is selected and visible
                tabs.forEach((t) => t.classList.remove('active'));
                if (loginTabBtn) loginTabBtn.classList.add('active');
                loginForm.classList.remove('d-none');
                signupForm.classList.add('d-none');
            } else {
                // Access Control: Self signup is enabled
                if (signupTabBtn) {
                    signupTabBtn.classList.remove('d-none');
                    signupTabBtn.textContent = 'Sign up';
                }
                if (tabsContainer) tabsContainer.classList.remove('d-none');
            }
        }
    } catch (err) {
        console.warn('Could not check setup status:', err);
    }
}


checkSystemSetupStatus();

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
    localStorage.removeItem('sb_cached_settings');
    localStorage.removeItem('sb_cached_profiles');

    if (data.user && data.user.must_reset_password) {
        window.location.href = 'pages/change-password.html';
    } else {
        window.location.href = 'pages/dashboard.html';
    }
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
        const passwordField = document.getElementById('loginPassword');
        passwordField.value = '';
        passwordField.focus();
    }
});

// --- Signup ---
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('signupError');
    errorEl.classList.remove('visible');

    const name = document.getElementById('signupName').value.trim();
    const username = document.getElementById('signupUsername').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;

    if (password !== confirmPassword) {
        showError(errorEl, 'Passwords do not match.');
        return;
    }

    try {
        const data = await apiFetch('/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ name, username, email, password }),
        });
        handleAuthSuccess(data);
    } catch (err) {
        showError(errorEl, err.message || 'Signup failed.');
    }
});