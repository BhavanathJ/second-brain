const authService = require('../services/authService');
const { hashPassword, comparePassword } = require('../utils/password');
const { signAccessToken, verifyAccessToken } = require('../utils/jwt');
const { generateRefreshToken, hashRefreshToken } = require('../utils/refreshToken');
const config = require('../config/env');

// Small helper: given a userId + profileId, issues BOTH tokens and
// persists the refresh token's hash. Used by signup and login —
// keeping it here avoids duplicating this exact sequence twice.
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
    // Postgres unique violation on users.email — race condition safety net,
    // catches the case where two signups for the same email land at nearly
    // the same time and both pass the findUserByEmail check above.
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
    // Same error for "no such user" and "wrong password" — never reveal
    // which one it was, that tells an attacker whether an email is registered.
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const passwordMatches = await comparePassword(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // TODO: once multi-profile selection exists, this should use the
    // user's last-active profile rather than always picking the first one.
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

    // Rotate: revoke the old refresh token, issue a brand new pair.
    // This means a stolen refresh token only works ONCE before it's dead —
    // if both the real user and an attacker try to use the same old token
    // after one of them already rotated it, the second attempt fails here.
    await authService.revokeRefreshToken(tokenHash);

    // We need profile_id for the new access token. Decode it from the
    // old (still cryptographically valid, just possibly-expired-soon)
    // access token would require the client to send it too — simpler to
    // look up the user's active profile fresh each refresh.
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
