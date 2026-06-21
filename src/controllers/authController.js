const authService = require('../services/authService');
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

  await authService.storeRefreshToken({ userId, tokenHash, expiresAt });

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

    const profile = await authService.findDefaultProfileForUser(existingToken.user_id);

    const tokens = await issueTokenPair({
      userId: existingToken.user_id,
      profileId: profile.id,
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

module.exports = { signup, login, refresh, logout };