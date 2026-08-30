// Bin controller stress test: large .in() chunking, restoring fired reminders, restoring purged entries, hard-delete habit error handling.
// Runs the ACTUAL binController end-to-end against the in-memory mock.

const { check, section, summary, makeReqRes, mock } = require('./helpers');

const binController = require('../src/controllers/binController');
const taskController = require('../src/controllers/taskController');
const habitController = require('../src/controllers/habitController');
const reminderController = require('../src/controllers/reminderController');
const profileController = require('../src/controllers/profileController');
const authController = require('../src/controllers/authController');
const authService = require('../src/services/authService');
const settingsService = require('../src/services/settingsService');
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
  const { user, profile } = await seedUserWithProfile('bin@example.com', 'binuser', 'password123', 'Main');
  const tokens = await getAuthToken(user.id, profile.id, user.username);

  // ================= BIN LISTING: CHUNKING (101 and 250 ids) =================
  section('Bin listing: large .in() chunking does not truncate');

  // 1. Create 150+ bin entries of a single entity type (tasks)
  const binEntries = [];
  for (let i = 0; i < 150; i++) {
    const task = mock.seed('tasks', { profile_id: profile.id, title: `Chunk Task ${i}`, status: 'pending', deleted_at: '2026-08-01T00:00:00Z' });
    const binEntry = mock.seed('bin_entries', { profile_id: profile.id, entity_type: 'task', entity_id: task.id });
    binEntries.push(binEntry);
  }

  // 2. List bin - should return all 150+ entries
  {
    const { body } = await call(binController.listBin, { profileId: profile.id });
    check(body.entries.length >= 150, 'listBin returns all 150+ entries', `got ${body.entries.length}`);
    check(body.entries.every(e => e.entity_type === 'task'), 'all entries are tasks');
  }

  // 3. Test exactly at chunk boundary: 101 entries
  const binEntries101 = [];
  for (let i = 0; i < 101; i++) {
    const task = mock.seed('tasks', { profile_id: profile.id, title: `Chunk101 Task ${i}`, status: 'pending', deleted_at: '2026-08-01T00:00:00Z' });
    mock.seed('bin_entries', { profile_id: profile.id, entity_type: 'task', entity_id: task.id });
    binEntries101.push(task);
  }

  {
    const { body } = await call(binController.listBin, { profileId: profile.id });
    // Should have at least 101 (the new ones) + previous = 251+
    check(body.entries.length >= 251, 'listBin handles 101-chunk boundary', `got ${body.entries.length}`);
  }

  // 4. Test another chunk boundary: 250 entries (total now ~401)
  const binEntries250 = [];
  for (let i = 0; i < 250; i++) {
    const task = mock.seed('tasks', { profile_id: profile.id, title: `Chunk250 Task ${i}`, status: 'pending', deleted_at: '2026-08-01T00:00:00Z' });
    mock.seed('bin_entries', { profile_id: profile.id, entity_type: 'task', entity_id: task.id });
    binEntries250.push(task);
  }

  {
    const { body } = await call(binController.listBin, { profileId: profile.id });
    check(body.entries.length >= 401, 'listBin handles 250-chunk boundary', `got ${body.entries.length}`);
  }

  // ================= RESTORE FIRED REMINDER =================
  section('Restore fired reminder: is_done reset to false');

  // 5. Create a reminder that was fired (is_done=true) and then soft-deleted
  const firedReminder = mock.seed('reminders', { profile_id: profile.id, title: 'Fired then deleted', remind_at: '2026-08-01T10:00:00Z', is_done: true, deleted_at: '2026-08-02T00:00:00Z' });
  const binReminder = mock.seed('bin_entries', { profile_id: profile.id, entity_type: 'reminder', entity_id: firedReminder.id });

  // 6. Restore the reminder
  {
    const r = await call(binController.restoreEntry, { profileId: profile.id, params: { id: binReminder.id } });
    check(r.status === 200, 'restore fired reminder → 200', `got ${r.status}`);
  }

  // 7. Verify the reminder is back with is_done=false
  const restoredReminder = mock._db.reminders.find(r => r.id === firedReminder.id);
  check(restoredReminder && restoredReminder.deleted_at === null, 'reminder restored (deleted_at cleared)');
  check(restoredReminder && restoredReminder.is_done === false, 'fired reminder restored with is_done=false', `got ${restoredReminder ? restoredReminder.is_done : 'no reminder'}`);

  // ================= RESTORE PURGED ENTRY =================
  section('Restore purged entry: returns clean 404');

  // 8. Create a bin entry with auto_purge_at in the past, then run the REAL
  // purge cron logic to actually remove it — setting the timestamp alone
  // does nothing; purging only happens when this function runs, exactly as
  // it does on a schedule in production (see server.js).
  const purgedTask = mock.seed('tasks', { profile_id: profile.id, title: 'Purged task', status: 'pending', deleted_at: '2026-01-01T00:00:00Z' });
  const purgedBin = mock.seed('bin_entries', { profile_id: profile.id, entity_type: 'task', entity_id: purgedTask.id, auto_purge_at: '2025-01-01T00:00:00Z' });
  await binController.purgeExpiredEntries();

  // 9. Try to restore the now-actually-purged entry
  {
    const r = await call(binController.restoreEntry, { profileId: profile.id, params: { id: purgedBin.id } });
    check(r.status === 404, 'restore purged entry → 404', `got ${r.status}`);
    check(r.body && r.body.error && r.body.error.includes('not found'), 'error says not found');
  }

  // ================= HARD DELETE HABIT: LOGS DELETED FIRST =================
  section('Hard delete habit: habit_logs deleted first, failure rolls back habit deletion');

  // 10. Create a habit with logs, soft-delete it (so it's in bin), then hard-delete
  const habit = mock.seed('habits', { profile_id: profile.id, title: 'Habit to hard delete', target_per_week: 7 });
  const log1 = mock.seed('habit_logs', { habit_id: habit.id, profile_id: profile.id, log_date: '2026-08-01', completed: true });
  const log2 = mock.seed('habit_logs', { habit_id: habit.id, profile_id: profile.id, log_date: '2026-08-02', completed: true });
  const binHabit = mock.seed('bin_entries', { profile_id: profile.id, entity_type: 'habit', entity_id: habit.id });

  // 11. Hard-delete the habit (this is the bin permanent delete for habit)
  {
    const r = await call(binController.permanentDelete, { profileId: profile.id, params: { id: binHabit.id } });
    check(r.status === 204, 'hard delete habit → 204', `got ${r.status}`);
  }

  // 12. Verify habit and its logs are gone
  const habitAfter = mock._db.habits.find(h => h.id === habit.id);
  check(!habitAfter, 'habit hard-deleted');

  const logsAfter = mock._db.habit_logs.filter(l => l.habit_id === habit.id);
  check(logsAfter.length === 0, 'habit_logs hard-deleted with habit', `remaining: ${logsAfter.length}`);

  // 13. Simulate the logs delete failing - we can't easily simulate this in the mock
  // but we can verify the order of operations by checking that the controller
  // attempts to delete logs first (the service does this)
  // Let's create another habit and verify the service would handle this correctly
  // by checking that if logs delete throws, the habit is not deleted

  // Create a new habit for this test
  const habit2 = mock.seed('habits', { profile_id: profile.id, title: 'Habit 2', target_per_week: 7 });
  const log3 = mock.seed('habit_logs', { habit_id: habit2.id, profile_id: profile.id, log_date: '2026-08-03', completed: true });
  const binHabit2 = mock.seed('bin_entries', { profile_id: profile.id, entity_type: 'habit', entity_id: habit2.id });

  // The mock doesn't simulate transaction failure, but we can verify the
  // correct behavior by checking the service code path is: delete logs, then delete habit
  // This is a regression test for the hardDeleteHabit error-swallow fix
  // The fix ensures that if logs deletion fails, the habit is NOT deleted
  // (we can't easily test the failure case in the mock, but we document it)
  console.log(`  [gap] hardDeleteHabit error rollback not testable in mock (requires transaction or error injection)`);

  summary();
})();