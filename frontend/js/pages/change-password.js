import { initLayout } from '../layout.js';
import { apiFetch } from '../api.js';
import { showToast } from '../toast.js';

// On success, the backend has revoked every refresh token for this
// user - including the one this session is using. Staying "logged in"
// afterward would be misleading, so log out immediately and send the
// user to a clean re-login instead.
async function handleChangePassword(e) {
    e.preventDefault();
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;

    if (newPassword !== confirmNewPassword) {
        showToast('New password and confirmation do not match.');
        return;
    }

    try {
        await apiFetch('/auth/password', {
            method: 'PATCH',
            body: JSON.stringify({ currentPassword, newPassword }),
        });

        showToast('Password changed. Logging you out...', 'success');
        setTimeout(() => {
            localStorage.clear();
            window.location.href = '../index.html';
        }, 1500);
    } catch (err) {
        showToast('Failed to change password: ' + err.message);
    }
}

async function main() {
    // 'change-password' tells initLayout where we are
    const layoutInfo = await initLayout('change-password');
    if (!layoutInfo) return;

    if (layoutInfo.mustResetPassword) {
        const backBtn = document.getElementById('backToSettingsBtn');
        if (backBtn) backBtn.classList.add('d-none');

        const title = document.getElementById('changePasswordTitle');
        if (title) title.textContent = 'Set New Password (Required)';

        const curLabel = document.querySelector('label[for="currentPassword"]');
        if (curLabel) curLabel.textContent = 'Current (or Temporary) Password';
    }

    document.getElementById('changePasswordForm').addEventListener('submit', handleChangePassword);
}

main();