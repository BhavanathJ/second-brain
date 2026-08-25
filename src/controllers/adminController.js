const adminService = require('../services/adminService');
const authService = require('../services/authService');
const { issueTokenPair } = require('./authController');

async function getSettings(req, res) {
    try {
        const settings = adminService.getAdminSettings();
        return res.status(200).json(settings);
    } catch (err) {
        console.error('getSettings error:', err);
        return res.status(500).json({ error: 'Failed to fetch admin settings.' });
    }
}

async function updateSettings(req, res) {
    try {
        const updated = adminService.updateAdminSettings(req.body);
        return res.status(200).json(updated);
    } catch (err) {
        console.error('updateSettings error:', err);
        return res.status(500).json({ error: 'Failed to update admin settings.' });
    }
}

async function resetLockout(req, res) {
    const { identifier } = req.body;
    if (!identifier) {
        return res.status(400).json({ error: 'Identifier (email or username) is required.' });
    }

    try {
        adminService.resetLoginAttempts(identifier);
        return res.status(200).json({ message: `Lockout cleared for ${identifier}.` });
    } catch (err) {
        console.error('resetLockout error:', err);
        return res.status(500).json({ error: 'Failed to reset lockout.' });
    }
}

async function getUsers(req, res) {
    try {
        const users = adminService.getAllUsers();
        return res.status(200).json({ users });
    } catch (err) {
        console.error('getUsers error:', err);
        return res.status(500).json({ error: 'Failed to load users.' });
    }
}

async function createUser(req, res) {
    const { name, username, email, password, role, status, must_reset_password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    try {
        const user = await adminService.adminCreateUser({
            name,
            username,
            email,
            password,
            role: role || 'USER',
            status: status || 'active',
            must_reset_password: Boolean(must_reset_password)
        });
        return res.status(201).json({ user });
    } catch (err) {
        console.error('createUser error:', err);
        return res.status(400).json({ error: err.message || 'Failed to create user.' });
    }
}

async function updateUser(req, res) {
    const { id } = req.params;
    try {
        const updated = adminService.adminUpdateUser(id, req.body);
        return res.status(200).json({ user: updated });
    } catch (err) {
        console.error('updateUser error:', err);
        return res.status(400).json({ error: err.message || 'Failed to update user.' });
    }
}

async function resetPassword(req, res) {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    try {
        await adminService.adminResetPassword(id, newPassword);
        return res.status(200).json({ message: 'User password reset successfully.' });
    } catch (err) {
        console.error('resetPassword error:', err);
        return res.status(400).json({ error: err.message || 'Failed to reset password.' });
    }
}

async function deleteUser(req, res) {
    const { id } = req.params;
    try {
        adminService.adminDeleteUser(req.userId, id);
        return res.status(200).json({ message: 'User deleted successfully.' });
    } catch (err) {
        console.error('deleteUser error:', err);
        return res.status(400).json({ error: err.message || 'Failed to delete user.' });
    }
}

async function impersonateUser(req, res) {
    const { id } = req.params;
    try {
        const targetUser = await authService.findUserById(id);
        if (!targetUser) {
            return res.status(404).json({ error: 'Target user not found.' });
        }

        const profile = await authService.findDefaultProfileForUser(targetUser.id);
        if (!profile) {
            return res.status(404).json({ error: 'Target user has no active profile.' });
        }

        const tokens = await issueTokenPair({
            user: targetUser,
            profileId: profile.id,
            impersonatedBy: req.userId
        });

        return res.status(200).json({
            user: {
                id: targetUser.id,
                name: targetUser.name,
                username: targetUser.username,
                email: targetUser.email,
                role: targetUser.role
            },
            profile: { id: profile.id, name: profile.name },
            ...tokens
        });
    } catch (err) {
        console.error('impersonateUser error:', err);
        return res.status(500).json({ error: 'Failed to impersonate user.' });
    }
}

async function getLockedAccounts(req, res) {
    try {
        const lockedAccounts = adminService.getLockedAccounts();
        return res.status(200).json({ lockedAccounts });
    } catch (err) {
        console.error('getLockedAccounts error:', err);
        return res.status(500).json({ error: 'Failed to fetch locked accounts.' });
    }
}

module.exports = {
    getSettings,
    updateSettings,
    resetLockout,
    getLockedAccounts,
    getUsers,
    createUser,
    updateUser,
    resetPassword,
    deleteUser,
    impersonateUser,
};

