// Controller-level stress test: a user who has used the app for a year.
// Seeds ~365 days of real-looking history into the in-memory mock, then
// drives the ACTUAL controllers/services end-to-end and asserts invariants:
// data isolation between profiles, bin restore/purge, reminder firing,
// note→task conversion, habit logging/streaks, dashboard ranges, calendar
// aggregation, and settings changes. The final section documents known
// validation gaps by demonstrating their current behavior.
//
// "Today" is the real clock (2026-08-09). Because the current week is
// partial, streak/weekly-count expectations are computed from an
// INDEPENDENT DB-based reference (raw seeded logs), not hard-coded - that
// also makes the whole file weekday-agnostic.

const { check, section, summary, makeReqRes, mock } = require('./helpers');
const { getLocalDateString, getLocalWeekStartDateString, addDaysToDateString } = require('../src/utils/profileTime');

const profileController = require('../src/controllers/profileController');
const taskController = require('../src/controllers/taskController');
const noteController = require('../src/controllers/noteController');
const habitController = require('../src/controllers/habitController');
const reminderController = require('../src/controllers/reminderController');
const binController = require('../src/controllers/binController');
const settingsController = require('../src/controllers/settingsController');
const calendarController = require('../src/controllers/calendarController');
const calendarEventController = require('../src/controllers/calendarEventController');
const dashboardController = require('../src/controllers/dashboardController');

const { fireReminders } = require('../src/services/reminderService');

const TZ = 'America/New_York';
const PROFILE = 'p1';
const OTHER = 'p2';
const DAY = 24 * 3600 * 1000;

function seedYear() {
  mock.seed('profiles', { id: PROFILE, user_id: 'u1', name: 'Main' });
  mock.seed('profiles', { id: OTHER, user_id: 'u1', name: 'Isolated' });
  mock.seed('settings', { profile_id: PROFILE, timezone: TZ, theme: 'light', week_starts_on: 0 });
  mock.seed('settings', { profile_id: OTHER, timezone: 'Asia/Kolkata', theme: 'dark', week_starts_on: 1 });

  const today = getLocalDateString(TZ);

  // --- Habits: daily (perfect), 3x/week (Mon/Wed/Fri), deleted ---
  const hDaily = mock.seed('habits', { profile_id: PROFILE, title: 'Meditate', target_per_week: 7 });
  const hThree = mock.seed('habits', { profile_id: PROFILE, title: 'Gym', target_per_week: 3 });
  const hDead = mock.seed('habits', { profile_id: PROFILE, title: 'Old habit', target_per_week: 5, deleted_at: '2026-01-15T00:00:00Z' });

  for (let i = 364; i >= 0; i--) {
    mock.seed('habit_logs', { habit_id: hDaily.id, profile_id: PROFILE, log_date: addDaysToDateString(today, -i), completed: true });
  }
  for (let i = 364; i >= 0; i--) {
    const d = addDaysToDateString(today, -i);
    const wd = new Date(d + 'T00:00:00Z').getUTCDay();
    if (wd === 1 || wd === 3 || wd === 5) {
      mock.seed('habit_logs', { habit_id: hThree.id, profile_id: PROFILE, log_date: d, completed: true });
    }
  }
  mock.seed('habit_logs', { habit_id: hDead.id, profile_id: PROFILE, log_date: addDaysToDateString(today, -3), completed: true });

  const hOther = mock.seed('habits', { profile_id: OTHER, title: 'Other habit', target_per_week: 7 });
  mock.seed('habit_logs', { habit_id: hOther.id, profile_id: OTHER, log_date: today, completed: true });

  // --- Tasks: ~60 across the year ---
  const overdue = mock.seed('tasks', { profile_id: PROFILE, title: 'Overdue report', status: 'pending', due_at: addDaysToDateString(today, -2) + 'T09:00:00Z' });
  mock.seed('tasks', { profile_id: PROFILE, title: 'Today call', status: 'pending', due_at: today + 'T15:00:00Z' });
  mock.seed('tasks', { profile_id: PROFILE, title: 'Done task', status: 'done', due_at: addDaysToDateString(today, -5) + 'T10:00:00Z' });
  mock.seed('tasks', { profile_id: PROFILE, title: 'Tomorrow task', status: 'pending', due_at: addDaysToDateString(today, 1) + 'T10:00:00Z' });
  mock.seed('tasks', { profile_id: PROFILE, title: 'Next week task', status: 'pending', due_at: addDaysToDateString(today, 6) + 'T10:00:00Z' });
  mock.seed('tasks', { profile_id: PROFILE, title: 'Far future', status: 'pending', due_at: addDaysToDateString(today, 30) + 'T10:00:00Z' });
  mock.seed('tasks', { profile_id: PROFILE, title: 'Deleted task', status: 'pending', deleted_at: addDaysToDateString(today, -10) + 'T00:00:00Z' });
  for (let i = 0; i < 50; i++) {
    mock.seed('tasks', { profile_id: PROFILE, title: `Old task ${i}`, status: 'done', due_at: addDaysToDateString(today, -(60 + i)) + 'T12:00:00Z' });
  }
  mock.seed('tasks', { profile_id: OTHER, title: 'Other task', status: 'pending', due_at: today + 'T12:00:00Z' });

  // --- Calendar events (one on a DST-transition day) ---
  mock.seed('calendar_events', { profile_id: PROFILE, title: 'DST spring event', starts_at: '2026-03-08T17:00:00Z', ends_at: '2026-03-08T18:00:00Z' });
  mock.seed('calendar_events', { profile_id: PROFILE, title: 'Today event', starts_at: today + 'T12:00:00Z' });
  mock.seed('calendar_events', { profile_id: PROFILE, title: 'Deleted event', starts_at: addDaysToDateString(today, -20) + 'T12:00:00Z', deleted_at: addDaysToDateString(today, -20) + 'T13:00:00Z' });

  // --- Reminders ---
  mock.seed('reminders', { profile_id: PROFILE, title: 'Fired reminder', remind_at: addDaysToDateString(today, -1) + 'T09:00:00Z', is_done: false });
  mock.seed('reminders', { profile_id: PROFILE, title: 'Pending reminder', remind_at: addDaysToDateString(today, 1) + 'T09:00:00Z', is_done: false });
  mock.seed('reminders', { profile_id: PROFILE, title: 'Linked reminder', remind_at: addDaysToDateString(today, 2) + 'T10:00:00Z', is_done: false, entity_type: 'task', entity_id: overdue.id });

  // --- Notes ---
  const n1 = mock.seed('notes', { profile_id: PROFILE, content: 'Meeting notes with lots of detail', tags: ['work', 'ideas'] });
  const n2 = mock.seed('notes', { profile_id: PROFILE, content: 'Convert this to a task note', tags: [] });

  // --- Bin entries (one expired, for the purge cron) ---
  mock.seed('bin_entries', {
    profile_id: PROFILE, entity_type: 'task',
    entity_id: mock.seed('tasks', { profile_id: PROFILE, title: 'Bin task', deleted_at: addDaysToDateString(today, -2) + 'T00:00:00Z' }).id,
  });
  mock.seed('bin_entries', { profile_id: PROFILE, entity_type: 'habit', entity_id: hDead.id });
  mock.seed('bin_entries', {
    profile_id: PROFILE, entity_type: 'note',
    entity_id: mock.seed('notes', { profile_id: PROFILE, content: 'Bin note', deleted_at: addDaysToDateString(today, -1) + 'T00:00:00Z' }).id,
  });
  const expired = mock.seed('bin_entries', {
    profile_id: PROFILE, entity_type: 'task',
    entity_id: mock.seed('tasks', { profile_id: PROFILE, title: 'Expired purge task', deleted_at: '2026-01-01T00:00:00Z' }).id,
  });
  expired.auto_purge_at = '2025-01-01T00:00:00Z'; // force expiry for the purge cron

  return { hDaily, hThree, hDead, n1, n2 };
}

const { hDaily, hThree, n1, n2 } = seedYear();

async function call(fn, overrides) {
  const { req, res } = makeReqRes({ profileId: PROFILE, ...(overrides || {}) });
  await fn(req, res);
  return { status: res.statusCode, body: res.body };
}

// ---- Independent DB-based references (read raw seeded logs) ----
function countInWeekStr(habitId, weekStartStr) {
  let c = 0;
  for (let d = 0; d < 7; d++) {
    const date = addDaysToDateString(weekStartStr, d);
    if (mock._db.habit_logs.some(l => l.habit_id === habitId && l.log_date === date && l.completed)) c++;
  }
  return c;
}
function refStreakFromDb(habitId, target, ws) {
  const today = getLocalDateString(TZ);
  let s = 0;
  const cur = countInWeekStr(habitId, ws);
  if (cur >= target) s++;
  else {
    const daysLeft = Math.round((new Date(addDaysToDateString(ws, 6) + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / DAY) + 1;
    if (cur + daysLeft < target) return 0; // current week already failed
  }
  let w = addDaysToDateString(ws, -7);
  for (let i = 1; i < 52; i++) {
    if (countInWeekStr(habitId, w) >= target) s++; else break;
    w = addDaysToDateString(w, -7);
  }
  return s;
}

(async () => {
  // ================= HABITS =================
  section('Habits after one year of logging');
  const ws0 = getLocalWeekStartDateString(TZ, 0);
  const expDailyStreak = refStreakFromDb(hDaily.id, 7, ws0);
  const expDailyCount = countInWeekStr(hDaily.id, ws0);
  const expThreeStreak = refStreakFromDb(hThree.id, 3, ws0);
  const expThreeCount = countInWeekStr(hThree.id, ws0);

  {
    const { status, body } = await call(habitController.listHabits);
    check(status === 200, 'listHabits → 200');
    const names = body.habits.map(h => h.title);
    check(body.habits.length === 2, 'deleted habit excluded from list', `got ${body.habits.length}: ${names.join(', ')}`);
    const daily = body.habits.find(h => h.id === hDaily.id);
    const three = body.habits.find(h => h.id === hThree.id);

    check(daily.streak === expDailyStreak, `daily streak matches DB reference (${expDailyStreak})`, `got ${daily.streak}`);
    check(daily.this_week_count === expDailyCount, `daily this_week_count matches DB (${expDailyCount})`, `got ${daily.this_week_count}`);
    check(daily.weekly_goal_met === (expDailyCount >= 7), 'daily weekly goal flag consistent');
    check(three.streak === expThreeStreak, `3x/week streak matches DB reference (${expThreeStreak})`, `got ${three.streak}`);
    check(three.this_week_count === expThreeCount, `3x/week this_week_count matches DB (${expThreeCount})`, `got ${three.this_week_count}`);

    const { body: single } = await call(habitController.getHabit, { params: { id: hDaily.id } });
    check(single.habit.streak === expDailyStreak, 'getHabit returns the same streak', `got ${single.habit.streak}`);
  }

  // ================= HABIT LOGGING EDGE CASES =================
  section('Habit logging: duplicate, delete, range');
  {
    const today = getLocalDateString(TZ);
    const r1 = await call(habitController.logCompletion, { params: { id: hDaily.id }, body: { date: today } });
    check(r1.status === 409, 'duplicate log for same date → 409', `got ${r1.status}`);

    const r2 = await call(habitController.logCompletion, { params: { id: hThree.id }, body: { date: addDaysToDateString(today, -10) } });
    check(r2.status === 201, 'logging a past date → 201', `got ${r2.status}`);
    const r3 = await call(habitController.deleteLog, { params: { id: hThree.id, date: addDaysToDateString(today, -10) } });
    check(r3.status === 204, 'deleting that log → 204', `got ${r3.status}`);
    const r4 = await call(habitController.deleteLog, { params: { id: hThree.id, date: addDaysToDateString(today, -10) } });
    check(r4.status === 404, 'deleting a non-existent log → 404', `got ${r4.status}`);

    const r5 = await call(habitController.getLogs, { params: { id: hThree.id }, query: { start: addDaysToDateString(today, -7), end: today } });
    check(r5.status === 200 && Array.isArray(r5.body.logs), 'getLogs valid range → 200 with array', `got ${r5.status}`);
  }

  // ================= TASKS + DASHBOARD =================
  section('Tasks & dashboard ranges');
  {
    const { body } = await call(dashboardController.getDashboard);
    check(body.overdue.tasks.some(t => t.title === 'Overdue report'), 'overdue includes yesterday\'s task');
    check(!body.overdue.tasks.some(t => t.title === 'Today call'), 'overdue excludes today\'s later task');
    check(!body.overdue.tasks.some(t => t.title === 'Done task'), 'overdue excludes done tasks');
    check(body.today.tasks.some(t => t.title === 'Today call'), 'today includes 3pm task');
    check(body.tomorrow.tasks.some(t => t.title === 'Tomorrow task'), 'tomorrow includes tomorrow task');
    check(body.next_7_days.tasks.some(t => t.title === 'Next week task'), 'next_7_days includes +6d task');
    check(!body.next_7_days.tasks.some(t => t.title === 'Far future'), 'next_7_days excludes +30d task');
    check(body.today.habits.every(h => typeof h.completed_today === 'boolean'), 'today habits carry completed_today');
    check(body.today.habits.find(h => h.id === hDaily.id).completed_today === true, 'daily habit marked complete today');
    check(body.today.habits.every(h => h.today_date === getLocalDateString(TZ)), 'today_date matches the server\'s local date');
  }

  // ================= CALENDAR =================
  section('Calendar aggregation across a year');
  {
    const today = getLocalDateString(TZ);
    const start = addDaysToDateString(today, -45);
    const end = addDaysToDateString(today, 45);
    const { status, body } = await call(calendarController.getCalendarData, { query: { start, end } });
    check(status === 200, 'calendar → 200');
    check(body.habitLogs.some(l => l.habits && l.habits.title === 'Meditate'), 'habit log carries nested habit title');
    check(body.habitLogs.some(l => l.habits && l.habits.title === 'Old habit'), 'calendar still shows a deleted habit\'s logs (by design)');
    check(!body.tasks.some(t => t.title === 'Deleted task'), 'deleted task hidden from calendar');
    check(body.calendarEvents.some(e => e.title === 'Today event'), 'calendar includes today\'s event');
    check(!body.calendarEvents.some(e => e.title === 'Deleted event'), 'deleted event hidden');
    check(body.reminders.some(r => r.title === 'Fired reminder'), 'pre-fire: the due reminder appears on the calendar');

    const r2 = await call(calendarController.getCalendarData, { query: { start: 'bogus', end: 'also-bogus' } });
    check(r2.status === 400, 'invalid date range → 400', `got ${r2.status}`);
    const r3 = await call(calendarController.getCalendarData, { query: { start, end: addDaysToDateString(today, 200) } });
    check(r3.status === 400, '>90 day range → 400', `got ${r3.status}`);
  }

  // ================= REMINDERS + FIRE CRON =================
  section('Reminders: fire cron + link validation');
  {
    const fired = await fireReminders();
    check(fired.some(r => r.title === 'Fired reminder'), 'fireReminders marks the past reminder done');
    check(!fired.some(r => r.title === 'Pending reminder'), 'pending (future) reminder untouched');

    const { body } = await call(reminderController.listReminders);
    const firedR = body.reminders.find(r => r.title === 'Fired reminder');
    check(firedR.is_done === true, 'fired reminder now is_done=true');

    const r1 = await call(reminderController.updateReminder, { params: { id: firedR.id }, body: { entity_type: 'bogus' } });
    check(r1.status === 400, 'invalid entity_type → 400', `got ${r1.status}`);
    const r2 = await call(reminderController.updateReminder, { params: { id: firedR.id }, body: { entity_type: 'task' } });
    check(r2.status === 400, 'entity_type without entity_id → 400', `got ${r2.status}`);
    const r3 = await call(reminderController.updateReminder, { params: { id: firedR.id }, body: { entity_id: 'some-uuid' } });
    check(r3.status === 400, 'entity_id without entity_type → 400', `got ${r3.status}`);

    const linked = body.reminders.find(r => r.title === 'Linked reminder');
    check(linked.entity_type === 'task' && linked.entity_id != null, 'linked reminder has both halves');
    const r4 = await call(reminderController.updateReminder, { params: { id: linked.id }, body: { entity_type: null } });
    check(r4.status === 200, 'clearing entity_type alone → 200', `got ${r4.status}`);
    const after = (await call(reminderController.getReminder, { params: { id: linked.id } })).body.reminder;
    check(after.entity_type === null && after.entity_id === null,
      'clearing one half of the link also clears the other (no dangling half)',
      JSON.stringify({ entity_type: after.entity_type, entity_id: after.entity_id }));
  }

  // ================= BIN =================
  section('Bin: list, restore, permanent delete, purge');
  {
    const { body } = await call(binController.listBin);
    check(body.entries.length >= 4, 'bin lists all deleted items');
    check(body.entries.every(e => typeof e.label === 'string'), 'every bin entry has a label');
    const taskEntry = body.entries.find(e => e.entity_type === 'task' && e.label === 'Bin task');
    check(Boolean(taskEntry), 'bin label resolved from the real task title');

    const r1 = await call(binController.restoreEntry, { params: { id: taskEntry.id } });
    check(r1.status === 200, 'restore a bin task → 200', `got ${r1.status}`);
    const { body: list } = await call(taskController.listTasks);
    check(list.tasks.some(t => t.title === 'Bin task'), 'restored task visible again');

    const noteEntry = body.entries.find(e => e.entity_type === 'note');
    const r2 = await call(binController.permanentDelete, { params: { id: noteEntry.id } });
    check(r2.status === 204, 'permanent delete of bin note → 204', `got ${r2.status}`);

    await binController.purgeExpiredEntries();
    const { body: after } = await call(binController.listBin);
    check(!after.entries.some(e => e.label === 'Expired purge task'), 'purge cron removed the expired entry');
    const { body: tasksAfter } = await call(taskController.listTasks);
    check(!tasksAfter.tasks.some(t => t.title === 'Expired purge task'), 'purged task hard-deleted from tasks');
  }

  // ================= NOTES + CONVERT =================
  section('Notes: create/update/convert');
  {
    const r1 = await call(noteController.convertNoteToTask, { params: { id: n2.id } });
    check(r1.status === 201, 'convert note → 201 with task', `got ${r1.status}`);
    check(r1.body.note.converted_task_id === r1.body.task.id, 'note points at the new task');
    const r2 = await call(noteController.convertNoteToTask, { params: { id: n2.id } });
    check(r2.status === 409, 'convert again → 409', `got ${r2.status}`);
    const r3 = await call(noteController.createNote, { body: { content: '' } });
    check(r3.status === 400, 'empty note content → 400', `got ${r3.status}`);
    const r4 = await call(noteController.listNotes, { query: { tags: 'work' } });
    check(r4.body.notes.some(n => n.id === n1.id), 'tag filter finds tagged note');
  }

  // ================= PROFILE ISOLATION =================
  section('Profile isolation');
  {
    const { body: tasksP1 } = await call(taskController.listTasks);
    check(!tasksP1.tasks.some(t => t.title === 'Other task'), 'p1 cannot see p2 tasks');
    const { body: habits } = await call(habitController.listHabits);
    check(!habits.habits.some(h => h.title === 'Other habit'), 'p1 cannot see p2 habits');

    const r = await call(profileController.selectProfile, { profileId: OTHER, params: { id: OTHER } });
    check(r.status === 200 && r.body.profile.id === OTHER, 'selectProfile issues a token pair for p2');
    const { body: t2 } = await call(taskController.listTasks, { profileId: OTHER });
    check(t2.tasks.some(t => t.title === 'Other task'), 'p2 sees its own task');
    check(!t2.tasks.some(t => t.title === 'Today call'), 'p2 does not see p1 tasks');
  }

  // ================= SETTINGS CHANGE (week start 0 → 1) =================
  section('Settings change mid-year (week_starts_on 0 → 1)');
  {
    const r = await call(settingsController.updateSettings, { body: { week_starts_on: 1 } });
    check(r.status === 200, 'update week_starts_on → 200');
    const { body } = await call(settingsController.getSettings);
    check(body.settings.week_starts_on === 1, 'week_starts_on persisted');

    const ws1 = getLocalWeekStartDateString(TZ, 1);
    const expThree = countInWeekStr(hThree.id, ws1);
    const { body: habits } = await call(habitController.listHabits);
    const three = habits.habits.find(h => h.id === hThree.id);
    check(three.this_week_count === expThree, `3x/week count matches the Mon-start week (${expThree})`, `got ${three.this_week_count}`);

    const bad = await call(settingsController.updateSettings, { body: { week_starts_on: 2 } });
    check(bad.status === 400, 'week_starts_on=2 → 400', `got ${bad.status}`);
    const badTz = await call(settingsController.updateSettings, { body: { timezone: 'Not/AZone' } });
    check(badTz.status === 400, 'invalid timezone → 400', `got ${badTz.status}`);
  }

  // ================= KNOWN VALIDATION GAPS (demonstrations) =================
  section('Known validation gaps - current behavior (documented, not fixed)');
  {
    const today = getLocalDateString(TZ);
    const r1 = await call(habitController.logCompletion, { params: { id: hThree.id }, body: { date: 'not-a-real-date' } });
    console.log(`  [gap] habit log with a non-date string    → HTTP ${r1.status} ${r1.body && r1.body.error ? `(${r1.body.error})` : '(mock stores it; real Postgres would reject with a 22P02 → 500)'}`);
    const r2 = await call(habitController.logCompletion, { params: { id: hThree.id }, body: { date: '2027-01-01' } });
    console.log(`  [gap] habit log dated ~5 months in future → HTTP ${r2.status} (accepted - inflates nothing now, but pollutes history)`);
    const r3 = await call(habitController.getLogs, { params: { id: hThree.id }, query: { start: 'bogus', end: 'bogus' } });
    console.log(`  [gap] habit logs range with bad dates     → HTTP ${r3.status} (mock string-compares leniently; real Postgres → 500)`);
    const r4 = await call(taskController.updateTask, { params: { id: 'definitely-missing' }, body: { title: 'x' } });
    console.log(`  [gap] update non-existent task            → HTTP ${r4.status} (safe - 404 via filter)`);
    const r5 = await call(taskController.createTask, { body: { title: 'bad status task', status: 'bogus' } });
    console.log(`  [gap] task with invalid status            → HTTP ${r5.status} (status "bogus" stored verbatim, not in {pending,done})`);
    const r6 = await call(calendarEventController.createCalendarEvent, { body: { title: 'e', starts_at: '2026-08-09T10:00:00Z', ends_at: '2026-08-09T09:00:00Z' } });
    console.log(`  [gap] new event ends before it starts     → HTTP ${r6.status} (rejected on create)`);
    const created = await call(calendarEventController.createCalendarEvent, { body: { title: 'real event', starts_at: '2026-08-09T10:00:00Z' } });
    const r7 = await call(calendarEventController.updateCalendarEvent, { params: { id: created.body.event.id }, body: { ends_at: '2026-08-09T09:00:00Z' } });
    console.log(`  [gap] event UPDATE can set ends < starts  → HTTP ${r7.status} (accepted - create validates, update does not)`);
    const r8 = await call(settingsController.updateSettings, { body: { theme: '' } });
    console.log(`  [gap] settings with empty theme           → HTTP ${r8.status} (empty string bypasses the truthiness check)`);
  }

  summary();
})();
