const authService = require('../services/authService');
const settingsService = require('../services/settingsService');
const { hashPassword, comparePassword } = require('../utils/password');
const { signAccessToken, verifyAccessToken } = require('../utils/jwt');
const { generateRefreshToken, hashRefreshToken } = require('../utils/refreshToken');
const config = require('../config/env');

async function issueTokenPair({ userId, profileId }) {
  const accessToken = signAccessToken({ userId, profileId });

  const rawRefreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const expiresAt = new Date(
    Date.now() + config.jwt.refreshExpiresInDays * 24 * 60 * 60 * 1000
  ).toISOString();

  await authService.storeRefreshToken({ userId, profileId, tokenHash, expiresAt });

  return { accessToken, refreshToken: rawRefreshToken };
}

async function signup(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  try {
    const existing = await authService.findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await hashPassword(password);
    const user = await authService.createUser({ email, passwordHash });
    const profile = await authService.createDefaultProfile(user.id);
    await settingsService.createDefaultSettings(profile.id);

    const tokens = await issueTokenPair({ userId: user.id, profileId: profile.id });

    return res.status(201).json({
      user: { id: user.id, email: user.email },
      profile: { id: profile.id, name: profile.name },
      ...tokens,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
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
    const user = await authService.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const passwordMatches = await comparePassword(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const profile = await authService.findDefaultProfileForUser(user.id);

    const tokens = await issueTokenPair({ userId: user.id, profileId: profile.id });

    return res.status(200).json({
      user: { id: user.id, email: user.email },
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

    await authService.revokeRefreshToken(tokenHash);

    const tokens = await issueTokenPair({
      userId: existingToken.user_id,
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

// Changes the logged-in user's password. Requires the CURRENT password
// (not just a valid session) — prevents someone who's grabbed an
// unlocked, logged-in browser from locking the real owner out by
// silently changing the password with no proof of knowing the old one.
//
// On success, revokes every refresh token for this user (all devices,
// all profiles) — see revokeAllRefreshTokensForUser for why. The
// current request's own tokens are NOT reissued here; the frontend
// must log the user back in with the new password.
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

module.exports = { signup, login, refresh, logout, changePassword, issueTokenPair };