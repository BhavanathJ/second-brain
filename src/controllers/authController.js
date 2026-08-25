const authService = require('../services/authService');
const settingsService = require('../services/settingsService');
const adminService = require('../services/adminService');
const { hashPassword, comparePassword } = require('../utils/password');
const { signAccessToken } = require('../utils/jwt');
const { generateRefreshToken, hashRefreshToken } = require('../utils/refreshToken');
const config = require('../config/env');

async function getSetupStatus(req, res) {
  try {
    const totalUsers = await authService.countUsers();
    const adminSettings = adminService.getAdminSettings();
    return res.status(200).json({
      initialized: totalUsers > 0,
      totalUsers,
      selfSignupEnabled: adminSettings.self_signup_enabled
    });
  } catch (err) {
    console.error('getSetupStatus error:', err);
    return res.status(500).json({ error: 'Failed to check system setup status.' });
  }
}

async function issueTokenPair({ user, profileId, impersonatedBy = null }) {

  const accessToken = signAccessToken({
    userId: user.id,
    profileId,
    role: user.role || 'USER',
    name: user.name || '',
    username: user.username || '',
    mustResetPassword: Boolean(user.must_reset_password),
    impersonatedBy
  });

  const rawRefreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const expiresAt = new Date(
    Date.now() + config.jwt.refreshExpiresInDays * 24 * 60 * 60 * 1000
  ).toISOString();

  await authService.storeRefreshToken({ userId: user.id, profileId, tokenHash, expiresAt });

  return { accessToken, refreshToken: rawRefreshToken };
}

async function signup(req, res) {
  const { name, username, email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  try {
    const totalUsers = await authService.countUsers();
    const isFirstUser = totalUsers === 0;

    // Check access control if not the first user
    if (!isFirstUser) {
      const adminSettings = adminService.getAdminSettings();
      if (!adminSettings.self_signup_enabled) {
        return res.status(403).json({ error: 'Self sign-up is disabled by administrator.' });
      }
    }

    const existing = await authService.findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await hashPassword(password);
    const userRole = isFirstUser ? 'ADMIN' : 'USER';

    const user = await authService.createUser({
      name,
      username,
      email,
      passwordHash,
      role: userRole,
      status: 'active'
    });

    const profile = await authService.createDefaultProfile(user.id);
    await settingsService.createDefaultSettings(profile.id);

    const tokens = await issueTokenPair({ user, profileId: profile.id });

    return res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role
      },
      profile: { id: profile.id, name: profile.name },
      ...tokens,
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    // 1. Check Rate Limiting Lockout
    const rateCheck = adminService.checkRateLimit(email, req.ip);
    if (rateCheck.isLocked) {
      return res.status(429).json({ error: rateCheck.message });
    }

    // Support logging in via email or username
    let user = await authService.findUserByEmail(email);
    if (!user) {
      user = await authService.findUserByUsername(email);
    }

    if (!user) {
      adminService.recordFailedLogin(email, req.ip);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.status === 'inactive') {
      return res.status(403).json({ error: 'Your account has been deactivated. Please contact an administrator.' });
    }

    const passwordMatches = await comparePassword(password, user.password_hash);
    if (!passwordMatches) {
      adminService.recordFailedLogin(email, req.ip);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Reset failed login attempts on successful authentication
    adminService.resetLoginAttempts(email);
    if (user.email) adminService.resetLoginAttempts(user.email);
    if (user.username) adminService.resetLoginAttempts(user.username);

    const profile = await authService.findDefaultProfileForUser(user.id);

    const tokens = await issueTokenPair({ user, profileId: profile.id });


    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        must_reset_password: Boolean(user.must_reset_password)
      },
      profile: { id: profile.id, name: profile.name },
      ...tokens,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

async function refresh(req, res) {
  const { refreshToken: rawRefreshToken } = req.body;

  if (!rawRefreshToken) {
    return res.status(400).json({ error: 'Refresh token is required.' });
  }

  try {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const existingToken = await authService.findActiveRefreshToken(tokenHash);

    if (!existingToken) {
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }

    const user = await authService.findUserById(existingToken.user_id);
    if (!user || user.status === 'inactive') {
      return res.status(401).json({ error: 'Session invalid or account deactivated.' });
    }

    await authService.revokeRefreshToken(tokenHash);

    const tokens = await issueTokenPair({
      user,
      profileId: existingToken.profile_id,
    });

    return res.status(200).json(tokens);
  } catch (err) {
    console.error('Refresh error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

async function logout(req, res) {
  const { refreshToken: rawRefreshToken } = req.body;

  if (!rawRefreshToken) {
    return res.status(400).json({ error: 'Refresh token is required.' });
  }

  try {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    await authService.revokeRefreshToken(tokenHash);
    return res.status(204).send();
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }

  try {
    const user = await authService.findUserById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const currentMatches = await comparePassword(currentPassword, user.password_hash);
    if (!currentMatches) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const newPasswordHash = await hashPassword(newPassword);
    await authService.updatePassword(req.userId, newPasswordHash);
    await authService.revokeAllRefreshTokensForUser(req.userId);

    return res.status(200).json({ message: 'Password changed. Please log in again.' });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

module.exports = { getSetupStatus, signup, login, refresh, logout, changePassword, issueTokenPair };