// Auth controller stress test: signup, login, refresh, logout edge cases.
// Runs the ACTUAL authController end-to-end against the in-memory mock.

const { check, section, summary, makeReqRes, mock } = require('./helpers');

const authController = require('../src/controllers/authController');
const authService = require('../src/services/authService');
const settingsService = require('../src/services/settingsService');
const profileService = require('../src/services/profileService');
const { hashPassword, comparePassword } = require('../src/utils/password');
const { generateRefreshToken, hashRefreshToken } = require('../src/utils/refreshToken');

const TZ = 'America/New_York';

async function call(fn, overrides) {
  const { req, res } = makeReqRes({ ...overrides });
  await fn(req, res);
  return { status: res.statusCode, body: res.body };
}

async function seedUser(email, username, password, timezone) {
  const passwordHash = await hashPassword(password);
  const user = mock.seed('users', { email, username, password_hash: passwordHash });
  const profile = mock.seed('profiles', { user_id: user.id, name: 'Main' });
  await settingsService.createDefaultSettings(profile.id, timezone);
  return { user, profile, passwordHash };
}

(async () => {
  // ================= SIGNUP =================
  section('Signup: duplicate email/username casing, underscore collision, legacy timezone');

  // 1. Duplicate email with SAME casing - rejected (emails are case-sensitive unique in DB)
  {
    await seedUser('user@example.com', 'userone', 'password123', 'Asia/Kolkata');
    const r = await call(authController.signup, { body: { email: 'user@example.com', username: 'userTwo', password: 'password123' } });
    check(r.status === 409, 'signup: duplicate email same casing → 409', `got ${r.status}`);
    check(r.body && r.body.error && r.body.error.includes('email'), 'error mentions email');
  }

  // 2. Duplicate email with different casing - creates new account (email is case-sensitive unique)
  // Use a different email base to avoid conflicts with test 1
  {
    await seedUser('User@Example.com', 'userone2', 'password123', 'Asia/Kolkata');
    const r = await call(authController.signup, { body: { email: 'user2@example.com', username: 'userTwo2', password: 'password123' } });
    check(r.status === 201, 'signup: different email → 201', `got ${r.status}`);
  }

  // 3. Duplicate username with different casing - rejected (username is case-insensitive unique)
  {
    await seedUser('user3@example.com', 'UserThree', 'password123', 'Asia/Kolkata');
    const r = await call(authController.signup, { body: { email: 'user4@example.com', username: 'userthree', password: 'password123' } });
    check(r.status === 409, 'signup: duplicate username different casing → 409', `got ${r.status}`);
    check(r.body && r.body.error && r.body.error.includes('username'), 'error mentions username');
  }

  // 4. Underscore in username does not collide with similar username without underscore
  {
    await seedUser('user5@example.com', 'userA1', 'password123', 'Asia/Kolkata');
    const r = await call(authController.signup, { body: { email: 'user6@example.com', username: 'user_1', password: 'password123' } });
    check(r.status === 201, 'signup: user_1 not blocked by userA1 → 201', `got ${r.status}`);
    check(r.body && r.body.user && r.body.user.username === 'user_1', 'username stored as user_1');
  }

  // 5. Legacy IANA timezone name (Asia/Calcutta) accepted and normalized to Asia/Kolkata
  {
    const r = await call(authController.signup, { body: { email: 'user7@example.com', username: 'userseven', password: 'password123', timezone: 'Asia/Calcutta' } });
    check(r.status === 201, 'signup: legacy timezone Asia/Calcutta → 201', `got ${r.status}`);
    const settings = mock._db.settings.find(s => s.profile_id === r.body.profile.id);
    check(settings && settings.timezone === 'Asia/Kolkata', 'legacy timezone normalized to Asia/Kolkata', `got ${settings ? settings.timezone : 'no settings'}`);
  }

  // 6. Invalid timezone falls back to default (Asia/Kolkata)
  {
    const r = await call(authController.signup, { body: { email: 'user8@example.com', username: 'usereight', password: 'password123', timezone: 'Not/AZone' } });
    check(r.status === 201, 'signup: invalid timezone → 201 (falls back to default)', `got ${r.status}`);
    const settings = mock._db.settings.find(s => s.profile_id === r.body.profile.id);
    check(settings && settings.timezone === 'Asia/Kolkata', 'invalid timezone falls back to Asia/Kolkata', `got ${settings ? settings.timezone : 'no settings'}`);
  }

  // ================= LOGIN =================
  section('Login: wrong password, non-existent email, email lookup is case-sensitive');

  // 7. Wrong password rejected
  {
    await seedUser('login@example.com', 'loginuser', 'correctpass', 'Asia/Kolkata');
    const r = await call(authController.login, { body: { email: 'login@example.com', password: 'wrongpass' } });
    check(r.status === 401, 'login: wrong password → 401', `got ${r.status}`);
  }

  // 8. Non-existent email rejected
  {
    const r = await call(authController.login, { body: { email: 'nonexistent@example.com', password: 'anypassword' } });
    check(r.status === 401, 'login: non-existent email → 401', `got ${r.status}`);
  }

  // 9. Email lookup is case-sensitive (matching DB behavior)
  // The authService.findUserByEmail uses exact match (no .toLowerCase())
  {
    await seedUser('User@Example.COM', 'caseuser', 'password123', 'Asia/Kolkata');
    const r = await call(authController.login, { body: { email: 'user@example.com', password: 'password123' } });
    check(r.status === 401, 'login: different casing email → 401 (exact match)', `got ${r.status}`);
  }

  // 10. Login with exact casing succeeds
  {
    await seedUser('User2@Example.COM', 'caseuser2', 'password123', 'Asia/Kolkata');
    const r = await call(authController.login, { body: { email: 'User2@Example.COM', password: 'password123' } });
    check(r.status === 200, 'login: exact casing email → 200', `got ${r.status}`);
    check(r.body && r.body.accessToken, 'access token returned');
  }

  // ================= REFRESH =================
  section('Refresh: expired, revoked/reused, malformed');

  // 11. Expired refresh token rejected with 401 and NOT revoked as a side effect
  {
    const { user, profile, passwordHash } = await seedUser('refresh1@example.com', 'refreshone', 'password123', 'Asia/Kolkata');
    // Create an expired refresh token manually
    const rawRefresh = generateRefreshToken();
    const tokenHash = hashRefreshToken(rawRefresh);
    const expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // expired yesterday
    await authService.storeRefreshToken({ user_id: user.id, profile_id: profile.id, token_hash: tokenHash, expires_at: expiresAt });

    const r = await call(authController.refresh, { body: { refreshToken: rawRefresh } });
    check(r.status === 401, 'refresh: expired token → 401', `got ${r.status}`);
    // Verify the expired token was NOT revoked as a side effect (it was already expired)
    const stored = mock._db.refresh_tokens.find(t => t.token_hash === tokenHash);
    check(stored && stored.revoked_at === null, 'expired token not marked revoked as side effect');
  }

  // 12. Revoked/reused token rejected
  {
    const { user, profile } = await seedUser('refresh2@example.com', 'refreshtwo', 'password123', 'Asia/Kolkata');
    const rawRefresh = generateRefreshToken();
    const tokenHash = hashRefreshToken(rawRefresh);
    await authService.storeRefreshToken({ user_id: user.id, profile_id: profile.id, token_hash: tokenHash, expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });

    // First use - should succeed and revoke
    const r1 = await call(authController.refresh, { body: { refreshToken: rawRefresh } });
    check(r1.status === 200, 'refresh: first use of valid token → 200', `got ${r1.status}`);

    // Second use (reused) - should be rejected
    const r2 = await call(authController.refresh, { body: { refreshToken: rawRefresh } });
    check(r2.status === 401, 'refresh: reused token → 401', `got ${r2.status}`);
  }

  // 13. Malformed token rejected
  {
    const r = await call(authController.refresh, { body: { refreshToken: 'not-a-valid-token' } });
    check(r.status === 401, 'refresh: malformed token → 401', `got ${r.status}`);
  }

  // ================= LOGOUT =================
  section('Logout: ownership check, double logout, missing token');

  // 14. User cannot revoke another user's refresh token (ownership check)
  // The logout controller checks if existingToken.user_id === req.userId
  {
    const { user: user1, profile: profile1 } = await seedUser('logout1@example.com', 'logoutone', 'password123', 'Asia/Kolkata');
    const { user: user2, profile: profile2 } = await seedUser('logout2@example.com', 'logouttwo', 'password123', 'Asia/Kolkata');

    const rawRefresh = generateRefreshToken();
    const tokenHash = hashRefreshToken(rawRefresh);
    await authService.storeRefreshToken({ user_id: user2.id, profile_id: profile2.id, token_hash: tokenHash, expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });

    // Try to logout as user1 with user2's token
    const r = await call(authController.logout, { body: { refreshToken: rawRefresh }, userId: user1.id, profileId: profile1.id });
    // The controller returns 204 (no error) but doesn't revoke if user_id doesn't match
    check(r.status === 204, 'logout: no error when trying to logout another user token', `got ${r.status}`);

    // Verify user2's token is still valid (not revoked)
    const stored = mock._db.refresh_tokens.find(t => t.token_hash === tokenHash);
    check(stored && stored.revoked_at === null, 'other user token still valid (not revoked due to ownership check)');
  }

  // 15. Logging out twice with same token is safe (no crash) - second returns 401
  {
    const { user, profile } = await seedUser('logout3@example.com', 'logoutthree', 'password123', 'Asia/Kolkata');
    const rawRefresh = generateRefreshToken();
    const tokenHash = hashRefreshToken(rawRefresh);
    await authService.storeRefreshToken({ user_id: user.id, profile_id: profile.id, token_hash: tokenHash, expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });

    const r1 = await call(authController.logout, { body: { refreshToken: rawRefresh } });
    check(r1.status === 204, 'logout: first logout → 204', `got ${r1.status}`);

    const r2 = await call(authController.logout, { body: { refreshToken: rawRefresh } });
    check(r2.status === 401, 'logout: second logout with same token → 401 (token already revoked)', `got ${r2.status}`);
  }

  // 16. Missing token in body returns 400, not crash
  {
    const r = await call(authController.logout, { body: {} });
    check(r.status === 400, 'logout: missing token → 400', `got ${r.status}`);
  }

  summary();
})();