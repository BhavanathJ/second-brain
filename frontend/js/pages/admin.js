import { apiRequest } from '../api.js';
import { renderNav } from '../layout.js';

let currentUsers = [];
let adminSettings = {};
let lockedAccounts = [];
let currentUserId = null;

// Parse current user from JWT
function getCurrentUserId() {
    try {
        const token = localStorage.getItem('accessToken') || localStorage.getItem('sb_access_token');
        if (!token) return null;
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.sub;
    } catch {
        return null;
    }
}

async function loadAdminData() {
    currentUserId = getCurrentUserId();
    try {
        const [settingsRes, usersRes, lockedRes] = await Promise.all([
            apiRequest('/admin/settings'),
            apiRequest('/admin/users'),
            apiRequest('/admin/locked-accounts').catch(() => ({ lockedAccounts: [] })),
        ]);

        adminSettings = settingsRes;
        currentUsers = usersRes.users || [];
        lockedAccounts = lockedRes.lockedAccounts || [];

        renderSettings();
        renderLockedAccounts();
        renderUsers();
    } catch (err) {
        console.error('Failed to load admin data:', err);
        if (err.message && err.message.includes('Admin privileges required')) {
            alert('Access Denied: You do not have admin permissions.');
            window.location.href = 'dashboard.html';
        }
    }
}

function renderLockedAccounts() {
    const container = document.getElementById('lockedAccountsContainer');
    const badge = document.getElementById('lockedAccountsCountBadge');
    if (!container) return;

    if (badge) {
        badge.textContent = `${lockedAccounts.length} Locked`;
        badge.className = lockedAccounts.length > 0 ? 'admin-pill-btn must-reset-yes' : 'admin-pill-btn active-green';
    }

    if (lockedAccounts.length === 0) {
        container.innerHTML = `
            <div class="d-flex align-items-center gap-2 text-success py-1" style="font-size: 0.82rem; font-weight: 600;">
                <span>&#9989;</span> No accounts or IP addresses are currently locked out.
            </div>
        `;
        return;
    }

    container.innerHTML = lockedAccounts.map(item => `
        <div class="d-flex align-items-center justify-content-between p-2 flex-wrap gap-2" style="background: var(--sb-surface-alt); border: 2px solid var(--sb-border); border-radius: var(--sb-radius);">
            <div>
                <div class="fw-bold text-danger" style="font-size: 0.88rem;">
                    &#128274; ${escapeHtml(item.identifier || item.ip_address)}
                </div>
                <div class="text-muted" style="font-size: 0.76rem;">
                    Failed: <strong>${item.failed_count}/${item.max_attempts}</strong> &bull; Lockout left: <strong>${item.minutes_remaining} min(s)</strong> &bull; IP: <code>${escapeHtml(item.ip_address || 'unknown')}</code>
                </div>
            </div>
            <button type="button" class="admin-action-btn admin-btn-reset-pw quick-unlock-btn" data-identifier="${escapeHtml(item.identifier || item.ip_address)}">
                &#128275; Unlock Now
            </button>
        </div>
    `).join('');

    container.querySelectorAll('.quick-unlock-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const identifier = btn.dataset.identifier;
            try {
                btn.disabled = true;
                btn.textContent = 'Unlocking...';
                await apiRequest('/admin/reset-lockout', {
                    method: 'POST',
                    body: JSON.stringify({ identifier })
                });
                await loadAdminData();
            } catch (err) {
                alert('Failed to unlock: ' + err.message);
                btn.disabled = false;
                btn.textContent = '🔓 Unlock Now';
            }
        });
    });
}

function renderSettings() {
    // 1. Access Control
    const selfSignupBtn = document.getElementById('toggleSelfSignupBtn');
    const selfSignupSub = document.getElementById('accessControlSubtitle');

    if (adminSettings.self_signup_enabled) {
        selfSignupBtn.textContent = 'Enabled';
        selfSignupBtn.className = 'admin-toggle-btn enabled';
        selfSignupSub.textContent = 'Local self-sign-up is enabled.';
    } else {
        selfSignupBtn.textContent = 'Disabled';
        selfSignupBtn.className = 'admin-toggle-btn disabled';
        selfSignupSub.textContent = 'Local self-sign-up is disabled.';
    }

    // 2. Rate Limiting
    const rateLimitBtn = document.getElementById('toggleRateLimitBtn');
    const windowInput = document.getElementById('rateLimitWindow');
    const maxAttemptsInput = document.getElementById('rateLimitMaxAttempts');

    if (adminSettings.rate_limit_enabled) {
        rateLimitBtn.textContent = 'Enabled';
        rateLimitBtn.className = 'admin-toggle-btn enabled w-100';
    } else {
        rateLimitBtn.textContent = 'Disabled';
        rateLimitBtn.className = 'admin-toggle-btn disabled w-100';
    }

    windowInput.value = adminSettings.rate_limit_window_minutes || 15;
    maxAttemptsInput.value = adminSettings.rate_limit_max_attempts || 20;
}

function renderUsers() {
    const usersTitle = document.getElementById('usersTitle');
    const tbody = document.getElementById('usersTableBody');

    usersTitle.textContent = `Users (${currentUsers.length})`;

    if (currentUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No users found.</td></tr>`;
        return;
    }

    tbody.innerHTML = currentUsers.map(user => {
        const isYou = user.id === currentUserId;
        const isAdmin = user.role === 'ADMIN';
        const isActive = user.status === 'active';
        const mustReset = user.must_reset_password;
        const isLocked = Boolean(user.is_locked);

        return `
            <tr class="admin-user-row" data-user-id="${user.id}">
                <td>
                    <div class="admin-user-info-name">
                        ${escapeHtml(user.name || user.email.split('@')[0])}
                        ${isYou ? '<span class="admin-you-badge">YOU</span>' : ''}
                        ${isLocked ? `<span class="badge bg-danger text-white ms-1" style="font-size: 0.68rem; border: 1.5px solid #121212;">&#128274; LOCKED (${user.locked_remaining}m)</span>` : ''}
                    </div>
                    <div class="admin-user-info-email">${escapeHtml(user.email)}</div>
                    <div class="admin-user-info-username">@${escapeHtml(user.username || '')}</div>
                </td>
                <td>
                    <select class="admin-role-select ${isAdmin ? 'role-admin' : 'role-user'}" data-action="change-role" ${isYou ? 'disabled' : ''}>
                        <option value="ADMIN" ${isAdmin ? 'selected' : ''}>ADMIN</option>
                        <option value="USER" ${!isAdmin ? 'selected' : ''}>USER</option>
                    </select>
                </td>
                <td>
                    <button type="button" class="admin-pill-btn ${isActive ? 'active-green' : 'inactive-gray'}" data-action="toggle-active" ${isYou ? 'disabled' : ''}>
                        ${isActive ? 'Active' : 'Inactive'}
                    </button>
                </td>
                <td>
                    <button type="button" class="admin-pill-btn ${mustReset ? 'must-reset-yes' : 'must-reset-no'}" data-action="toggle-must-reset">
                        ${mustReset ? 'Yes' : 'No'}
                    </button>
                </td>
                <td>
                    <div class="d-flex align-items-center gap-1 flex-wrap">
                        ${isLocked ? `
                            <button type="button" class="admin-action-btn admin-btn-reset-pw user-row-unlock-btn" data-identifier="${escapeHtml(user.email)}" title="Unlock User">
                                &#128275; Unlock
                            </button>
                        ` : ''}
                        ${!isYou ? `
                            <button type="button" class="admin-action-btn admin-btn-impersonate" data-action="impersonate" title="Impersonate User">
                                &rarr; Impersonate
                            </button>
                        ` : ''}
                        <button type="button" class="admin-action-btn admin-btn-reset-pw" data-action="open-reset-pw" title="Reset Password">
                            &#128273; Reset Password
                        </button>
                        ${!isYou ? `
                            <button type="button" class="admin-action-btn admin-btn-delete" data-action="delete-user" title="Delete User">
                                &#128465;
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Attach unlock handlers in table
    tbody.querySelectorAll('.user-row-unlock-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const identifier = btn.dataset.identifier;
            try {
                btn.disabled = true;
                btn.textContent = 'Unlocking...';
                await apiRequest('/admin/reset-lockout', {
                    method: 'POST',
                    body: JSON.stringify({ identifier })
                });
                await loadAdminData();
            } catch (err) {
                alert('Failed to unlock: ' + err.message);
                btn.disabled = false;
                btn.textContent = '🔓 Unlock';
            }
        });
    });
}


function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Event Listeners and Actions
document.addEventListener('DOMContentLoaded', async () => {
    await renderNav();
    await loadAdminData();

    document.getElementById('adminRefreshBtn').addEventListener('click', () => {
        loadAdminData();
    });

    // 1. Toggle Self Sign-up
    document.getElementById('toggleSelfSignupBtn').addEventListener('click', async () => {
        try {
            const nextVal = !adminSettings.self_signup_enabled;
            const updated = await apiRequest('/admin/settings', {
                method: 'PATCH',
                body: JSON.stringify({ self_signup_enabled: nextVal })
            });
            adminSettings = updated;
            renderSettings();
        } catch (err) {
            alert('Failed to update Access Control: ' + err.message);
        }
    });

    // 2. Toggle Rate Limiting
    document.getElementById('toggleRateLimitBtn').addEventListener('click', async () => {
        try {
            const nextVal = !adminSettings.rate_limit_enabled;
            const updated = await apiRequest('/admin/settings', {
                method: 'PATCH',
                body: JSON.stringify({ rate_limit_enabled: nextVal })
            });
            adminSettings = updated;
            renderSettings();
        } catch (err) {
            alert('Failed to update Rate Limiting: ' + err.message);
        }
    });

    // Auto-save Window and Max Attempts
    let debounceTimer = null;
    const triggerAutoSave = () => {
        const statusEl = document.getElementById('rateLimitSaveStatus');
        statusEl.textContent = 'Saving...';
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            try {
                const windowMin = Number(document.getElementById('rateLimitWindow').value) || 15;
                const maxAttempts = Number(document.getElementById('rateLimitMaxAttempts').value) || 20;

                const updated = await apiRequest('/admin/settings', {
                    method: 'PATCH',
                    body: JSON.stringify({
                        rate_limit_window_minutes: windowMin,
                        rate_limit_max_attempts: maxAttempts
                    })
                });
                adminSettings = updated;
                statusEl.textContent = 'All changes saved';
            } catch (err) {
                statusEl.textContent = 'Save failed';
            }
        }, 600);
    };

    document.getElementById('rateLimitWindow').addEventListener('input', triggerAutoSave);
    document.getElementById('rateLimitMaxAttempts').addEventListener('input', triggerAutoSave);

    // Reset Lockout
    document.getElementById('resetLockoutBtn').addEventListener('click', async () => {
        const input = document.getElementById('resetLockoutInput');
        const feedback = document.getElementById('lockoutFeedback');
        const identifier = input.value.trim();

        if (!identifier) {
            feedback.innerHTML = '<span class="text-danger">Please enter an email or username.</span>';
            return;
        }

        try {
            const res = await apiRequest('/admin/reset-lockout', {
                method: 'POST',
                body: JSON.stringify({ identifier })
            });
            feedback.innerHTML = `<span class="text-success">${res.message || 'Lockout cleared.'}</span>`;
            input.value = '';
            setTimeout(() => { feedback.innerHTML = ''; }, 3500);
        } catch (err) {
            feedback.innerHTML = `<span class="text-danger">${err.message || 'Failed to reset lockout.'}</span>`;
        }
    });

    // Create New User Form
    document.getElementById('newUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('newUserError');
        errEl.textContent = '';

        const name = document.getElementById('newUserName').value.trim();
        const username = document.getElementById('newUserUsername').value.trim();
        const email = document.getElementById('newUserEmail').value.trim();
        const password = document.getElementById('newUserPassword').value;
        const role = document.getElementById('newUserRole').value;
        const status = document.getElementById('newUserStatus').value;
        const must_reset_password = document.getElementById('newUserMustReset').checked;

        try {
            await apiRequest('/admin/users', {
                method: 'POST',
                body: JSON.stringify({
                    name,
                    username,
                    email,
                    password,
                    role,
                    status,
                    must_reset_password
                })
            });

            // Close modal & reset form
            const modalEl = document.getElementById('newUserModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            document.getElementById('newUserForm').reset();

            await loadAdminData();
        } catch (err) {
            errEl.textContent = err.message || 'Failed to create user.';
        }
    });

    // Table Actions (Role, Active, Must Reset, Impersonate, Reset PW, Delete)
    document.getElementById('usersTableBody').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const tr = btn.closest('tr');
        const userId = tr.dataset.userId;
        const user = currentUsers.find(u => u.id === userId);
        if (!user) return;

        const action = btn.dataset.action;

        // Toggle Active
        if (action === 'toggle-active') {
            const nextStatus = user.status === 'active' ? 'inactive' : 'active';
            try {
                const res = await apiRequest(`/admin/users/${userId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: nextStatus })
                });
                user.status = res.user.status;
                renderUsers();
            } catch (err) {
                alert('Failed to update status: ' + err.message);
            }
        }

        // Toggle Must Reset
        if (action === 'toggle-must-reset') {
            const nextReset = !user.must_reset_password;
            try {
                const res = await apiRequest(`/admin/users/${userId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ must_reset_password: nextReset })
                });
                user.must_reset_password = res.user.must_reset_password;
                renderUsers();
            } catch (err) {
                alert('Failed to update must reset: ' + err.message);
            }
        }

        // Open Reset PW Modal
        if (action === 'open-reset-pw') {
            document.getElementById('resetPasswordUserId').value = userId;
            document.getElementById('resetPasswordUserLabel').textContent = `Setting new password for ${user.name || user.email} (${user.email}).`;
            document.getElementById('adminNewPassword').value = '';
            document.getElementById('resetPasswordError').textContent = '';

            const modalEl = document.getElementById('resetPasswordModal');
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        }

        // Delete User
        if (action === 'delete-user') {
            if (!confirm(`Are you sure you want to permanently delete user "${user.name || user.email}"? This will remove all their tasks, notes, habits, and data.`)) {
                return;
            }

            try {
                await apiRequest(`/admin/users/${userId}`, { method: 'DELETE' });
                currentUsers = currentUsers.filter(u => u.id !== userId);
                renderUsers();
            } catch (err) {
                alert('Failed to delete user: ' + err.message);
            }
        }

        // Impersonate User
        if (action === 'impersonate') {
            if (!confirm(`Switch session to user "${user.name || user.email}"?`)) {
                return;
            }

            try {
                // Save original admin tokens in sessionStorage to restore later
                const adminAccess = localStorage.getItem('accessToken');
                const adminRefresh = localStorage.getItem('refreshToken');
                if (!sessionStorage.getItem('sb_admin_backup_access')) {
                    sessionStorage.setItem('sb_admin_backup_access', adminAccess);
                    sessionStorage.setItem('sb_admin_backup_refresh', adminRefresh);
                }

                const res = await apiRequest(`/admin/users/${userId}/impersonate`, {
                    method: 'POST'
                });

                localStorage.setItem('accessToken', res.accessToken);
                localStorage.setItem('refreshToken', res.refreshToken);
                localStorage.removeItem('sb_cached_settings');
                localStorage.removeItem('sb_cached_profiles');

                window.location.href = 'dashboard.html';
            } catch (err) {
                alert('Failed to impersonate: ' + err.message);
            }

        }
    });

    // Handle Role Change on Select
    document.getElementById('usersTableBody').addEventListener('change', async (e) => {
        if (e.target.dataset.action === 'change-role') {
            const tr = e.target.closest('tr');
            const userId = tr.dataset.userId;
            const newRole = e.target.value;

            try {
                const res = await apiRequest(`/admin/users/${userId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ role: newRole })
                });
                const user = currentUsers.find(u => u.id === userId);
                if (user) user.role = res.user.role;
                renderUsers();
            } catch (err) {
                alert('Failed to update role: ' + err.message);
                renderUsers();
            }
        }
    });

    // Submit Password Reset
    document.getElementById('resetPasswordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = document.getElementById('resetPasswordUserId').value;
        const newPassword = document.getElementById('adminNewPassword').value;
        const errEl = document.getElementById('resetPasswordError');
        errEl.textContent = '';

        try {
            await apiRequest(`/admin/users/${userId}/reset-password`, {
                method: 'POST',
                body: JSON.stringify({ newPassword })
            });

            const modalEl = document.getElementById('resetPasswordModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            alert('Password successfully reset. User will be required to change it on next login.');
            await loadAdminData();
        } catch (err) {
            errEl.textContent = err.message || 'Failed to reset password.';
        }
    });
});
