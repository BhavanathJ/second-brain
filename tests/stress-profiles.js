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

  // 4. Set up profile with all entity types
  const deleteProfile = mock.seed('profiles', { user_id: user1.id, name: 'ToDelete' });
  await settingsService.createDefaultSettings(deleteProfile.id, TZ);

  const task = mock.seed('tasks', { profile_id: deleteProfile.id, title: 'Delete task', status: 'pending' });
  const note = mock.seed('notes', { profile_id: deleteProfile.id, content: 'Delete note' });
  const habit = mock.seed('habits', { profile_id: deleteProfile.id, title: 'Delete habit', target_per_week: 7 });
  const habitLog = mock.seed('habit_logs', { habit_id: habit.id, profile_id: deleteProfile.id, log_date: '2026-08-01', completed: true });
  const reminder = mock.seed('reminders', { profile_id: deleteProfile.id, title: 'Delete reminder', remind_at: '2026-08-01T10:00:00Z' });
  const calEvent = mock.seed('calendar_events', { profile_id: deleteProfile.id, title: 'Delete event', starts_at: '2026-08-01T10:00:00Z' });
  const binEntry = mock.seed('bin_entries', { profile_id: deleteProfile.id, entity_type: 'task', entity_id: task.id });

  // 5. Delete the profile
  {
    const r = await call(profileController.deleteProfile, { userId: user1.id, params: { id: deleteProfile.id } });
    check(r.status === 204, 'delete profile → 204', `got ${r.status}`);
  }

  // 6. Verify all cascade deletes happened
  const tasksAfter = mock._db.tasks.filter(t => t.profile_id === deleteProfile.id);
  check(tasksAfter.length === 0, 'tasks cascade deleted', `remaining: ${tasksAfter.length}`);

  const notesAfter = mock._db.notes.filter(n => n.profile_id === deleteProfile.id);
  check(notesAfter.length === 0, 'notes cascade deleted', `remaining: ${notesAfter.length}`);

  const habitsAfter = mock._db.habits.filter(h => h.profile_id === deleteProfile.id);
  check(habitsAfter.length === 0, 'habits cascade deleted', `remaining: ${habitsAfter.length}`);

  const habitLogsAfter = mock._db.habit_logs.filter(l => l.profile_id === deleteProfile.id);
  check(habitLogsAfter.length === 0, 'habit_logs cascade deleted', `remaining: ${habitLogsAfter.length}`);

  const remindersAfter = mock._db.reminders.filter(r => r.profile_id === deleteProfile.id);
  check(remindersAfter.length === 0, 'reminders cascade deleted', `remaining: ${remindersAfter.length}`);

  const calEventsAfter = mock._db.calendar_events.filter(e => e.profile_id === deleteProfile.id);
  check(calEventsAfter.length === 0, 'calendar_events cascade deleted', `remaining: ${calEventsAfter.length}`);

  const binEntriesAfter = mock._db.bin_entries.filter(b => b.profile_id === deleteProfile.id);
  check(binEntriesAfter.length === 0, 'bin_entries cascade deleted', `remaining: ${binEntriesAfter.length}`);

  // 7. Verify other profiles' data is untouched
  const otherTasks = mock._db.tasks.filter(t => t.profile_id === profile1.id);
  check(otherTasks.length > 0, 'other profile tasks untouched');
  const otherNotes = mock._db.notes.filter(n => n.profile_id === profile1.id);
  check(otherNotes.length > 0, 'other profile notes untouched');
  const otherHabits = mock._db.habits.filter(h => h.profile_id === profile1.id);
  check(otherHabits.length > 0, 'other profile habits untouched');

  // ================= SELECT PROFILE: REVOKES PREVIOUS REFRESH TOKEN =================
  section('selectProfile: revokes caller\'s previous refresh token');

  // 8. Create a refresh token for user1 with profile1
  const oldRefresh = generateRefreshToken();
  const oldTokenHash = hashRefreshToken(oldRefresh);
  await authService.storeRefreshToken({ user_id: user1.id, profile_id: profile1.id, token_hash: oldTokenHash, expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });

  // 9. Select a different profile (profile2 doesn't belong to user1, so use profile3 which is user1's)
  // Actually, let's create a new profile for user1 and select it
  const newProfile = mock.seed('profiles', { user_id: user1.id, name: 'NewProfile' });
  await settingsService.createDefaultSettings(newProfile.id, TZ);

  {
    const r = await call(profileController.selectProfile, { userId: user1.id, params: { id: newProfile.id } });
    check(r.status === 200, 'selectProfile → 200', `got ${r.status}`);
    check(r.body && r.body.accessToken, 'new access token issued');
    check(r.body && r.body.refreshToken, 'new refresh token issued');
  }

  // 10. Old refresh token should now be rejected
  {
    const r = await call(authController.refresh, { body: { refreshToken: oldRefresh } });
    check(r.status === 401, 'old refresh token rejected after selectProfile → 401', `got ${r.status}`);
  }

  // ================= CROSS-ACCOUNT ACCESS =================
  section('Cross-account access: user cannot select/fetch another user\'s profile');

  // 11. User1 cannot select user2's profile by guessing the ID
  {
    const r = await call(profileController.selectProfile, { userId: user1.id, params: { id: profile2.id } });
    check(r.status === 404, 'selectProfile: cross-account → 404', `got ${r.status}`);
  }

  // 12. User1 cannot fetch user2's profile via listProfiles (should only see own)
  {
    const r = await call(profileController.listProfiles, { userId: user1.id });
    check(r.status === 200, 'listProfiles → 200');
    const names = r.body.profiles.map(p => p.name);
    check(!names.includes('Other'), 'user1 cannot see user2\'s profile in list', `got ${names.join(', ')}`);
    check(names.includes('Main'), 'user1 sees own profile');
    check(names.includes('Work'), 'user1 sees own second profile');
    check(names.includes('Personal'), 'user1 sees own third profile');
    check(names.includes('NewProfile'), 'user1 sees own fourth profile');
  }

  summary();
})();