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
  // Real signup always lowercases email before storing (see authController.js).
  // Normalize here too, so seeded test data matches that real invariant.
  const user = mock.seed('users', { email: email.toLowerCase(), username, password_hash: passwordHash });
  const profile = mock.seed('profiles', { user_id: user.id, name: 'Main' });
  await settingsService.createDefaultSettings(profile.id, timezone);
  return { user, profile, passwordHash };
}

(async () => {
  // ================= SIGNUP =================
  section('Signup: duplicate email/username casing, underscore collision, legacy timezone');

  // 1. Duplicate email with SAME casing - rejected (emails are unique, case-insensitively)
  {
    await seedUser('user@example.com', 'userone', 'password123', 'Asia/Kolkata');
    const r = await call(authController.signup, { body: { email: 'user@example.com', username: 'userTwo', password: 'password123' } });
    check(r.status === 409, 'signup: duplicate email same casing → 409', `got ${r.status}`);
    check(r.body && r.body.error && r.body.error.includes('email'), 'error mentions email');
  }

  // 2. Duplicate email with DIFFERENT casing - also rejected (email uniqueness
  // is case-insensitive: authController lowercases input before checking,
  // and findUserByEmail/createUser both lowercase before their DB calls)
  {
    await seedUser('CaseEmail@Example.com', 'userone2', 'password123', 'Asia/Kolkata');
    const r = await call(authController.signup, { body: { email: 'caseemail@EXAMPLE.com', username: 'userTwo2', password: 'password123' } });
    check(r.status === 409, 'signup: duplicate email different casing → 409', `got ${r.status}`);
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
  section('Login: wrong password, non-existent email, email lookup is case-insensitive');

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

  // 9. Email lookup is case-insensitive (authController lowercases the input
  // before lookup, and findUserByEmail also lowercases before its .eq() check)
  {
    await seedUser('CaseLogin@Example.COM', 'caseuser', 'password123', 'Asia/Kolkata');
    // seedUser normalizes to lowercase at insert time (matching real signup),
    // so login with a DIFFERENT casing here proves login's own lowercasing
    // works, not just that the seed happened to already match.
    const r = await call(authController.login, { body: { email: 'CASELOGIN@EXAMPLE.COM', password: 'password123' } });
    check(r.status === 200, 'login: different casing email → 200 (case-insensitive)', `got ${r.status}`);
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
    await authService.storeRefreshToken({ userId: user.id, profileId: profile.id, tokenHash, expiresAt });

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
    await authService.storeRefreshToken({ userId: user.id, profileId: profile.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });

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
    await authService.storeRefreshToken({ userId: user2.id, profileId: profile2.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });

    // Try to logout as user1 with user2's token
    const r = await call(authController.logout, { body: { refreshToken: rawRefresh }, userId: user1.id, profileId: profile1.id });
    // The controller returns 204 (no error) but doesn't revoke if user_id doesn't match
    check(r.status === 204, 'logout: no error when trying to logout another user token', `got ${r.status}`);

    // Verify user2's token is still valid (not revoked)
    const stored = mock._db.refresh_tokens.find(t => t.token_hash === tokenHash);
    check(stored && stored.revoked_at === null, 'other user token still valid (not revoked due to ownership check)');
  }

  // 15. Logging out twice with same token is safe (no crash). logout() always
  // returns 204 regardless of token validity - a deliberate anti-enumeration
  // design so this endpoint never reveals whether a given token exists,
  // belongs to someone else, or was already used. See authController.js.
  {
    const { user, profile } = await seedUser('logout3@example.com', 'logoutthree', 'password123', 'Asia/Kolkata');
    const rawRefresh = generateRefreshToken();
    const tokenHash = hashRefreshToken(rawRefresh);
    await authService.storeRefreshToken({ userId: user.id, profileId: profile.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });

    const r1 = await call(authController.logout, { body: { refreshToken: rawRefresh }, userId: user.id });
    check(r1.status === 204, 'logout: first logout → 204', `got ${r1.status}`);

    const r2 = await call(authController.logout, { body: { refreshToken: rawRefresh } });
    check(r2.status === 204, 'logout: second logout with same (now-revoked) token → 204 (no enumeration)', `got ${r2.status}`);

    // The real security property: the token is actually revoked after the
    // first logout, even though the response doesn't reveal that.
    const stored = mock._db.refresh_tokens.find(t => t.token_hash === tokenHash);
    check(stored && stored.revoked_at !== null, 'token is actually revoked after first logout', `revoked_at: ${stored ? stored.revoked_at : 'not found'}`);
  }

  // 16. Missing token in body returns 400, not crash
  {
    const r = await call(authController.logout, { body: {} });
    check(r.status === 400, 'logout: missing token → 400', `got ${r.status}`);
  }

  summary();
})();