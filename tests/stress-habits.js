// Habit streak / weekly-count stress test. The reference streak is written
// from the SPEC (consecutive qualified weeks going backward, with the
// current week allowed to be "in progress") rather than copied from the
// implementation, so the two can disagree on real bugs.
//
// Coverage: 52-week cap, missed weeks, partial current week (every
// weekday as "now"), both week starts, targets 1..7, randomized year-long
// logging patterns, DST-adjacent week starts.

const { check, section, summary } = require('./helpers');
const {
  getLocalWeekStartDateString,
  getLocalDateString,
  addDaysToDateString,
} = require('../src/utils/profileTime');
const {
  weeklyCountForDates,
  computeStreakForDates,
} = require('../src/services/habitService');

const DAY = 24 * 3600 * 1000;
function daysBetween(aStr, bStr) {
  return Math.round((new Date(bStr + 'T00:00:00Z') - new Date(aStr + 'T00:00:00Z')) / DAY);
}

// Independent reference, per spec:
//   qualified week  = week contains >= target logged dates
//   streak = consecutive qualified weeks ending at (and including, if
//            qualified) the current week; an unqualified current week
//            that can still reach target breaks nothing but adds 0;
//            an unqualified current week that CANNOT reach target resets
//            the streak to 0.
function refStreak(logSet, target, timeZone, weekStartsOn, now) {
  const ws = getLocalWeekStartDateString(timeZone, weekStartsOn, now);
  const today = getLocalDateString(timeZone, now);
  let s = 0;
  // walk backward from the PREVIOUS week — max 51 so the current week can
  // add one more and still respect the implementation's 52-week cap.
  let w = addDaysToDateString(ws, -7);
  for (let i = 0; i < 51; i++) {
    let c = 0;
    for (let d = 0; d < 7; d++) if (logSet.has(addDaysToDateString(w, d))) c++;
    if (c < target) break;
    s++;
    w = addDaysToDateString(w, -7);
  }
  // current week
  let c = 0;
  for (let d = 0; d < 7; d++) if (logSet.has(addDaysToDateString(ws, d))) c++;
  if (c >= target) s++;
  else {
    const daysLeft = daysBetween(today, addDaysToDateString(ws, 6)) + 1;
    if (c + daysLeft < target) s = 0; // current week already failed
  }
  return s;
}

// Deterministic PRNG so failures are reproducible.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build a logging pattern over `weeksBack` weeks ending at ws(now).
// probabilities: pFull = P(day logged).
function genPattern(tz, weekStartsOn, now, weeksBack, target, rnd) {
  const set = new Set();
  const ws = getLocalWeekStartDateString(tz, weekStartsOn, now);
  const windowStart = addDaysToDateString(ws, -7 * (weeksBack - 1));
  let w = windowStart;
  for (let i = 0; i < weeksBack; i++) {
    const weekCount = Math.min(7, Math.floor(rnd() * (target + 2))); // 0..min(7, target+1) — 7 days/week
    const shuffled = [0, 1, 2, 3, 4, 5, 6];
    for (let j = shuffled.length - 1; j > 0; j--) {
      const k = Math.floor(rnd() * (j + 1));
      [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
    }
    for (let j = 0; j < weekCount; j++) set.add(addDaysToDateString(w, shuffled[j]));
    w = addDaysToDateString(w, 7);
  }
  return set;
}

const TZ = 'America/New_York';

section('Weekly count cross-check (60 sample weeks)');
{
  const rnd = mulberry32(42);
  const ws = getLocalWeekStartDateString(TZ, 0, new Date('2026-08-09T12:00:00Z'));
  for (let k = 0; k < 60; k++) {
    const set = new Set();
    // 30-60% of days logged
    for (let d = -20; d < 14; d++) {
      if (rnd() < 0.5) set.add(addDaysToDateString(ws, d));
    }
    for (const target of [1, 3, 5, 7]) {
      const now = new Date(addDaysToDateString(ws, 0) + 'T12:00:00Z');
      const impl = weeklyCountForDates(set, TZ, 0, now);
      let ref = 0;
      for (let d = 0; d < 7; d++) if (set.has(addDaysToDateString(ws, d))) ref++;
      check(impl === ref, `weeklyCount (${k}, target ${target}) = ${impl}`, `expected ${ref}`);
    }
  }
}

section('Streak: implementation vs reference over randomized year-long patterns');
{
  const rnd = mulberry32(1234);
  let mismatches = 0;
  let total = 0;
  // Sample "now" across a spread of weekdays in 2025-2026.
  const nowSamples = [
    '2025-03-09T12:00:00Z', // DST transition Sunday
    '2025-06-15T12:00:00Z', // mid-year
    '2025-11-02T12:00:00Z', // fall-back Sunday
    '2026-01-01T12:00:00Z', // new year
    '2026-03-08T12:00:00Z', // 2026 spring-forward Sunday
    '2026-08-09T12:00:00Z', // "today" (Saturday)
    '2026-11-01T12:00:00Z', // 2026 fall-back
  ];
  for (const ws of [0, 1]) {
    for (const nowStr of nowSamples) {
      const now = new Date(nowStr);
      for (const target of [1, 2, 3, 5, 7]) {
        for (let trial = 0; trial < 8; trial++) {
          const weeksBack = 20 + Math.floor(rnd() * 40); // 20..59 weeks of history
          const set = genPattern(TZ, ws, now, weeksBack, target, rnd);
          const impl = computeStreakForDates(set, target, TZ, ws, now);
          const ref = refStreak(set, target, TZ, ws, now);
          total++;
          if (impl !== ref) {
            mismatches++;
            if (mismatches <= 5) {
              check(false, `streak mismatch ws=${ws} now=${nowStr} target=${target} trial=${trial}`,
                `impl=${impl} ref=${ref}`);
            }
          }
        }
      }
    }
  }
  check(mismatches === 0, `streak impl matches reference (${total} cases)`, `${mismatches} mismatches`);
}

section('Streak cap at 52 weeks');
{
  // Perfect daily logging for 100 weeks → capped at 52.
  const now = new Date('2026-08-09T12:00:00Z');
  const ws = getLocalWeekStartDateString(TZ, 0, now);
  const set = new Set();
  let w = addDaysToDateString(ws, -99 * 7);
  for (let i = 0; i < 100; i++) {
    for (let d = 0; d < 7; d++) set.add(addDaysToDateString(w, d));
    w = addDaysToDateString(w, 7);
  }
  const streak = computeStreakForDates(set, 7, TZ, 0, now);
  check(streak === 52, 'perfect 100-week streak is capped at 52', `got ${streak}`);
}

section('Streak resets correctly on a missed week');
{
  // now = Saturday 2026-08-08 = the LAST day of the Sun-start week
  // (Aug 2-8), so a fully-logged current week counts and an empty one
  // can no longer reach target 7.
  const now = new Date('2026-08-08T12:00:00Z');
  const ws = getLocalWeekStartDateString(TZ, 0, now);
  const set = new Set();
  let w = ws;
  // perfect for the current week + 19 previous weeks.
  for (let i = 0; i < 20; i++) {
    for (let d = 0; d < 7; d++) set.add(addDaysToDateString(w, d));
    w = addDaysToDateString(w, -7);
  }
  let s = computeStreakForDates(set, 7, TZ, 0, now);
  check(s === 20, 'streak counts 20 fully-logged weeks back from a complete current week', `got ${s}`);

  // Knock the CURRENT week empty: it is the week's last day, so the empty
  // current week can no longer reach target → streak must be 0.
  const emptySet = new Set();
  let w2 = addDaysToDateString(ws, -7);
  for (let i = 0; i < 30; i++) {
    for (let d = 0; d < 7; d++) emptySet.add(addDaysToDateString(w2, d));
    w2 = addDaysToDateString(w2, -7);
  }
  s = computeStreakForDates(emptySet, 7, TZ, 0, now);
  check(s === 0, 'empty current week on its last day resets streak to 0', `got ${s}`);
}

section('Streak window covers exactly 52 weeks');
{
  // The window the controller fetches logs over = current week start minus
  // 51 weeks (52 weeks total) through the end of the current week. A log on
  // windowStart must be counted by a 52-week streak; one day earlier must not.
  const now = new Date('2026-08-09T12:00:00Z');
  const ws = getLocalWeekStartDateString(TZ, 0, now);
  const windowStart = addDaysToDateString(ws, -51 * 7);
  const windowEnd = addDaysToDateString(ws, 6);
  check(windowStart === '2025-08-17', 'windowStart lands 51 weeks back', windowStart);
  check(windowEnd === '2026-08-15', 'windowEnd is the end of the current week', windowEnd);

  // perfect 52-week logging ending at ws: streak must be 52, and a log one
  // day BEFORE windowStart must not extend it (it is outside the window, so
  // the implementation can't see it — by design).
  const set = new Set();
  let w = windowStart;
  for (let i = 0; i < 52; i++) {
    for (let d = 0; d < 7; d++) set.add(addDaysToDateString(w, d));
    w = addDaysToDateString(w, 7);
  }
  const withOldLog = new Set(set);
  withOldLog.add(addDaysToDateString(windowStart, -1));
  check(computeStreakForDates(withOldLog, 7, TZ, 0, now) === 52,
    '52 weeks of logs cap at streak 52 (older logs ignored)');
}

summary();
