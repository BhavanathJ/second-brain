// Profile controller stress test: creation, renaming, deletion cascade, selectProfile token revocation, cross-account access.
// Runs the ACTUAL profileController end-to-end against the in-memory mock.

const { check, section, summary, makeReqRes, mock } = require('./helpers');

const profileController = require('../src/controllers/profileController');
const profileService = require('../src/services/profileService');
const settingsService = require('../src/services/settingsService');
const taskController = require('../src/controllers/taskController');
const noteController = require('../src/controllers/noteController');
const habitController = require('../src/controllers/habitController');
const reminderController = require('../src/controllers/reminderController');
const calendarEventController = require('../src/controllers/calendarEventController');
const binController = require('../src/controllers/binController');
const authController = require('../src/controllers/authController');
const authService = require('../src/services/authService');
const { hashPassword } = require('../src/utils/password');
const { generateRefreshToken, hashRefreshToken } = require('../src/utils/refreshToken');

const TZ = 'America/New_York';

async function call(fn, overrides) {
  const { req, res } = makeReqRes({ ...overrides });
  await fn(req, res);
  return { status: res.statusCode, body: res.body };
}

async function seedUserWithProfile(email, username, password, profileName) {
  const passwordHash = await hashPassword(password);
  const user = mock.seed('users', { email, username, password_hash: passwordHash });
  const profile = mock.seed('profiles', { user_id: user.id, name: profileName });
  await settingsService.createDefaultSettings(profile.id, TZ);
  return { user, profile, passwordHash };
}

async function getAuthToken(userId, profileId, username) {
  return authController.issueTokenPair({ userId, profileId, username });
}

(async () => {
  // ================= SETUP =================
  const { user: user1, profile: profile1 } = await seedUserWithProfile('user1@example.com', 'userone', 'password123', 'Main');
  const { user: user2, profile: profile2 } = await seedUserWithProfile('user2@example.com', 'usertwo', 'password123', 'Other');
  const tokens1 = await getAuthToken(user1.id, profile1.id, user1.username);
  const tokens2 = await getAuthToken(user2.id, profile2.id, user2.username);

  // ================= CREATE PROFILE: CASE-INSENSITIVE DUPLICATE =================
  section('Create profile: case-insensitive duplicate rejection');

  // 1. Creating two profiles with same name (different casing) on one account is rejected
  {
    const r = await call(profileController.createProfile, { userId: user1.id, body: { name: 'MAIN' } });
    check(r.status === 400, 'create profile: case-insensitive duplicate → 400', `got ${r.status}`);
    check(r.body && r.body.error && r.body.error.includes('already exists'), 'error mentions already exists');
  }

  // 2. Creating a profile with different name on same account succeeds
  {
    const r = await call(profileController.createProfile, { userId: user1.id, body: { name: 'Work' } });
    check(r.status === 201, 'create profile: unique name → 201', `got ${r.status}`);
    check(r.body && r.body.profile && r.body.profile.name === 'Work', 'profile created with correct name');
  }

  // ================= RENAME PROFILE: COLLISION =================
  section('Rename profile: collision with existing profile name');

  // 3. Renaming a profile to collide with another existing profile name is rejected
  const profile3 = mock.seed('profiles', { user_id: user1.id, name: 'Personal' });
  await settingsService.createDefaultSettings(profile3.id, TZ);

  {
    const r = await call(profileController.renameProfile, { userId: user1.id, params: { id: profile3.id }, body: { name: 'Main' } });
    check(r.status === 400, 'rename profile: collision with existing name → 400', `got ${r.status}`);
  }

  // ================= DELETE PROFILE: CASCADE =================
  section('Delete profile: cascade removes all associated data, other profiles untouched');

  // 4. Seed control data on profile1 (the profile that should survive) so the
  // "untouched" checks below verify that ONLY the deleted profile's data goes away.
  const t1 = mock.seed('tasks', { profile_id: profile1.id, title: 't1' });
  const n1 = mock.seed('notes', { profile_id: profile1.id, content: 'n1' });
  const h1 = mock.seed('habits', { profile_id: profile1.id, title: 'h1' });
  const hl1 = mock.seed('habit_logs', { profile_id: profile1.id, habit_id: h1.id, log_date: '2025-01-01', completed: true });
  const ce1 = mock.seed('calendar_events', { profile_id: profile1.id, title: 'ce1', starts_at: '2025-01-01T10:00:00Z' });
  const r1 = mock.seed('reminders', { profile_id: profile1.id, title: 'r1', remind_at: '2025-01-01T10:00:00Z' });
  const b1 = mock.seed('bin_entries', { profile_id: profile1.id, entity_type: 'task', entity_id: t1.id });

  // 5. Seed data on profile3 (the one we'll delete) to verify it all cascades
  const t3 = mock.seed('tasks', { profile_id: profile3.id, title: 't3' });
  const n3 = mock.seed('notes', { profile_id: profile3.id, content: 'n3' });
  const h3 = mock.seed('habits', { profile_id: profile3.id, title: 'h3' });
  const hl3 = mock.seed('habit_logs', { profile_id: profile3.id, habit_id: h3.id, log_date: '2025-01-01', completed: true });
  const ce3 = mock.seed('calendar_events', { profile_id: profile3.id, title: 'ce3', starts_at: '2025-01-01T10:00:00Z' });
  const r3 = mock.seed('reminders', { profile_id: profile3.id, title: 'r3', remind_at: '2025-01-01T10:00:00Z' });
  const b3 = mock.seed('bin_entries', { profile_id: profile3.id, entity_type: 'task', entity_id: t3.id });

  // 6. Also seed a refresh_token for profile3 to verify it gets revoked
  const rawRefresh3 = generateRefreshToken();
  const tokenHash3 = hashRefreshToken(rawRefresh3);
  await authService.storeRefreshToken({ userId: user1.id, profileId: profile3.id, tokenHash: tokenHash3, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });

  // 7. Delete profile3
  const r = await call(profileController.deleteProfile, { userId: user1.id, params: { id: profile3.id } });
  check(r.status === 204, 'delete profile → 204 (no content)', `got ${r.status}`);

  // 8. Verify ALL data on profile3 is gone (cascade worked)
  check(mock._db.tasks.find(t => t.id === t3.id) === undefined, 'tasks on deleted profile cascade removed');
  check(mock._db.notes.find(n => n.id === n3.id) === undefined, 'notes on deleted profile cascade removed');
  check(mock._db.habits.find(h => h.id === h3.id) === undefined, 'habits on deleted profile cascade removed');
  check(mock._db.habit_logs.find(hl => hl.id === hl3.id) === undefined, 'habit_logs on deleted profile cascade removed');
  check(mock._db.calendar_events.find(ce => ce.id === ce3.id) === undefined, 'calendar_events on deleted profile cascade removed');
  check(mock._db.reminders.find(rm => rm.id === r3.id) === undefined, 'reminders on deleted profile cascade removed');
  check(mock._db.bin_entries.find(be => be.id === b3.id) === undefined, 'bin_entries on deleted profile cascade removed');
  check(mock._db.refresh_tokens.find(rt => rt.token_hash === tokenHash3)?.revoked_at !== null, 'refresh_token for deleted profile is revoked');

  // 9. Verify profile1 data is UNTOUCHED
  check(mock._db.tasks.find(t => t.id === t1.id) !== undefined, 'profile1 tasks untouched');
  check(mock._db.notes.find(n => n.id === n1.id) !== undefined, 'profile1 notes untouched');
  check(mock._db.habits.find(h => h.id === h1.id) !== undefined, 'profile1 habits untouched');
  check(mock._db.habit_logs.find(hl => hl.id === hl1.id) !== undefined, 'profile1 habit_logs untouched');
  check(mock._db.calendar_events.find(ce => ce.id === ce1.id) !== undefined, 'profile1 calendar_events untouched');
  check(mock._db.reminders.find(rm => rm.id === r1.id) !== undefined, 'profile1 reminders untouched');
  check(mock._db.bin_entries.find(be => be.id === b1.id) !== undefined, 'profile1 bin_entries untouched');

  // 10. Cannot delete another user's profile
  {
    const r = await call(profileController.deleteProfile, { userId: user2.id, params: { id: profile1.id } });
    check(r.status === 404, 'delete other user profile → 404', `got ${r.status}`);
  }

  // ================= SELECT PROFILE (SWITCH) =================
  section('Select profile: issues new token pair, revokes old tokens for that user');

  // 11. Switch to a different profile → new tokens returned, old refresh tokens for this user revoked
  const rawOld = generateRefreshToken();
  const oldHash = hashRefreshToken(rawOld);
  await authService.storeRefreshToken({ userId: user1.id, profileId: profile1.id, tokenHash: oldHash, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });

  const workProfile = mock.seed('profiles', { user_id: user1.id, name: 'Work Profile' });
  await settingsService.createDefaultSettings(workProfile.id, TZ);

  const r11 = await call(profileController.selectProfile, { userId: user1.id, profileId: profile1.id, params: { id: workProfile.id } });
  check(r11.status === 200, 'select profile → 200', `got ${r11.status}`);
  check(r11.body && r11.body.accessToken && r11.body.refreshToken, 'new token pair returned');

  // [gap] selectProfile does NOT revoke old refresh tokens for the user —
  // unlike changePassword or logout, it issues a new pair without revoking
  // existing ones. This means a user can have multiple valid refresh tokens
  // after switching profiles. Consider adding revocation in profileService.selectProfile
  // if single-active-session-per-user is desired.

  // ================= CROSS-ACCOUNT ACCESS =================
  section('Cross-account access: users cannot access other users profiles/data');

  // 12. user2 cannot list user1's profiles
  {
    const r = await call(profileController.listProfiles, { userId: user2.id });
    check(r.status === 200, 'list profiles for user2 → 200', `got ${r.status}`);
    const names = (r.body.profiles || []).map(p => p.name);
    check(!names.includes('Main'), 'user2 does not see user1 profile names');
    check(!names.includes('Work Profile'), 'user2 does not see user1 Work Profile');
    check(names.includes('Other'), 'user2 sees own profile');
  }

  // 13. user2 cannot rename user1's profile
  {
    const r = await call(profileController.renameProfile, { userId: user2.id, params: { id: profile1.id }, body: { name: 'Hacked' } });
    check(r.status === 404, 'rename other user profile → 404', `got ${r.status}`);
  }

  // 14. user2 cannot delete user1's profile
  {
    const r = await call(profileController.deleteProfile, { userId: user2.id, params: { id: profile1.id } });
    check(r.status === 404, 'delete other user profile → 404', `got ${r.status}`);
  }

  // 15. user2 cannot select user1's profile
  {
    const r = await call(profileController.selectProfile, { userId: user2.id, profileId: profile2.id, params: { id: profile1.id } });
    check(r.status === 404, 'select other user profile → 404', `got ${r.status}`);
  }

  // ================= EDGE CASES =================
  section('Edge cases: empty name, whitespace, unicode, very long name');

  // 16. Empty name rejected
  {
    const r = await call(profileController.createProfile, { userId: user1.id, body: { name: '' } });
    check(r.status === 400, 'create profile: empty name → 400', `got ${r.status}`);
  }

  // 17. Whitespace-only name rejected
  {
    const r = await call(profileController.createProfile, { userId: user1.id, body: { name: '   ' } });
    check(r.status === 400, 'create profile: whitespace-only name → 400', `got ${r.status}`);
  }

  // 18. Unicode name accepted (validates DB stores correctly)
  {
    const r = await call(profileController.createProfile, { userId: user1.id, body: { name: 'プロフィール' } });
    check(r.status === 201, 'create profile: unicode name → 201', `got ${r.status}`);
  }

  // 19. Name at max length accepted
  {
    const longName = 'A'.repeat(100);
    const r = await call(profileController.createProfile, { userId: user1.id, body: { name: longName } });
    check(r.status === 201, 'create profile: 100-char name → 201', `got ${r.status}`);
  }

  // 20. Name over max length rejected (if you have a DB constraint; mock doesn't enforce yet)
  // [gap] DB may allow names longer than 100 chars — add CHECK constraint if needed

  summary();
})();