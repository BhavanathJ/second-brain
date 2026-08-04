import { initLayout } from '../layout.js';
import { apiFetch } from '../api.js';
import { showToast } from '../toast.js';

// On success, the backend has revoked every refresh token for this
// user — including the one this session is using. Staying "logged in"
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
    // 'settings' keeps the Settings nav link highlighted while on this
    // sub-page, since there's no separate top-level nav entry for it.
    const layoutInfo = await initLayout('settings');
    if (!layoutInfo) return;

    document.getElementById('changePasswordForm').addEventListener('submit', handleChangePassword);
}

main();