// Year-long time/bounds stress test. Exercises the pure profileTime
// functions across two full DST cycles (2025 + 2026) in timezones with:
//   - standard US DST      (America/New_York,  60 min shift)
//   - EU DST               (Europe/Berlin,      60 min shift)
//   - 30-minute DST        (Australia/Lord_Howe, 30 min shift)
//   - no DST               (Asia/Kolkata)
// Every date is checked for: correct local midnight, day length in
// [23h, 25h] (23.5h / 24.5h for Lord Howe), and that getLocalDayBounds
// ends exactly at the NEXT local midnight - 1ms (the DST fix).

const { check, section, summary } = require('./helpers');
const {
  getLocalMidnightUTC,
  getLocalDayBounds,
  getLocalRangeBounds,
  getLocalWeekStartDateString,
  getLocalDateString,
  addDaysToDateString,
} = require('../src/utils/profileTime');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function formatInZone(iso, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(iso));
  const g = t => (parts.find(p => p.type === t) || {}).value;
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`;
}

// An instant guaranteed to fall ON dateStr in timeZone (local noon).
function localNoon(timeZone, dateStr) {
  return new Date(getLocalMidnightUTC(timeZone, dateStr).getTime() + 12 * HOUR);
}

function enumerateDates(startStr, endStr) {
  const out = [];
  let d = startStr;
  while (d <= endStr) {
    out.push(d);
    d = addDaysToDateString(d, 1);
  }
  return out;
}

const RANGE_START = '2025-01-01';
const RANGE_END = '2026-12-31';

// (date, spanHours) — exact day-length on known transition days.
const KNOWN_TRANSITIONS = {
  'America/New_York': {
    '2025-03-09': 23, '2025-11-02': 25,
    '2026-03-08': 23, '2026-11-01': 25,
  },
  'Europe/Berlin': {
    '2025-03-30': 23, '2025-10-26': 25,
    '2026-03-29': 23, '2026-10-25': 25,
  },
  // Southern hemisphere: DST ENDS first Sunday of April (longer 24.5h day)
  // and STARTS first Sunday of October (shorter 23.5h day).
  'Australia/Lord_Howe': {
    '2025-04-06': 24.5, '2025-10-05': 23.5,
    '2026-04-05': 24.5, '2026-10-04': 23.5,
  },
  'Asia/Kolkata': {},
};

const TIMEZONES = Object.keys(KNOWN_TRANSITIONS);

for (const tz of TIMEZONES) {
  section(`Day bounds over 2 years — ${tz}`);
  let badMidnights = 0;
  let badSpans = 0;
  let badBounds = 0;
  const transitions = KNOWN_TRANSITIONS[tz];

  for (const dateStr of enumerateDates(RANGE_START, RANGE_END)) {
    const midnight = getLocalMidnightUTC(tz, dateStr);
    const shown = formatInZone(midnight.toISOString(), tz);
    if (shown !== `${dateStr} 00:00:00`) {
      badMidnights++;
      if (badMidnights <= 3) check(false, `midnight ${dateStr}`, `rendered as ${shown}`);
    }

    const nextMidnight = getLocalMidnightUTC(tz, addDaysToDateString(dateStr, 1));
    const spanHours = (nextMidnight.getTime() - midnight.getTime()) / HOUR;
    if (spanHours < 23 || spanHours > 25) {
      badSpans++;
      if (badSpans <= 3) check(false, `day length ${dateStr}`, `${spanHours}h`);
    } else if (transitions[dateStr] !== undefined && Math.abs(spanHours - transitions[dateStr]) > 0.01) {
      badSpans++;
      check(false, `transition day ${dateStr}`, `expected ${transitions[dateStr]}h, got ${spanHours}h`);
    }

    // getLocalDayBounds with a now-on-that-day must return exactly
    // [localMidnight, nextLocalMidnight - 1ms] — the DST fix.
    const bounds = getLocalDayBounds(tz, 0, localNoon(tz, dateStr));
    const expectEnd = new Date(nextMidnight.getTime() - 1).toISOString();
    if (bounds.start !== midnight.toISOString() || bounds.end !== expectEnd) {
      badBounds++;
      if (badBounds <= 3) {
        check(false, `day bounds ${dateStr}`,
          `start=${bounds.start} end=${bounds.end} (expect end=${expectEnd})`);
      }
    }
  }

  check(badMidnights === 0, `${tz}: all ${enumerateDates(RANGE_START, RANGE_END).length} local midnights exact`, `${badMidnights} bad`);
  check(badSpans === 0, `${tz}: all day lengths within [23h,25h] + exact transitions`, `${badSpans} bad`);
  check(badBounds === 0, `${tz}: all day bounds end exactly at next-midnight - 1ms`, `${badBounds} bad`);
}

// --- getLocalRangeBounds spans multiple days incl. DST boundaries ---
section('Range bounds across a DST boundary');
{
  const tz = 'America/New_York';
  // Span from just before the 2025 spring-forward to just after it.
  const now = localNoon(tz, '2025-03-08');
  const range = getLocalRangeBounds(tz, 5, now);
  check(range.start === getLocalDayBounds(tz, 0, now).start, 'range.start = day0 start');
  check(range.end === getLocalDayBounds(tz, 4, now).end, 'range.end = day4 end');

  const startMs = new Date(range.start).getTime();
  const endMs = new Date(range.end).getTime();
  // 5 calendar days = 4×24h + one 23h day between consecutive midnights,
  // then the range END is the last midnight - 1ms.
  const span = (endMs - startMs);
  check(span === 4 * DAY + 23 * HOUR - 1, '5-day span across spring-forward = 119h - 1ms', `${span / HOUR}h`);
}

// --- Week-start alignment for both week_starts_on settings, all year ---
section('Week-start alignment (Sun=0 and Mon=1)');
for (const ws of [0, 1]) {
  const tz = 'America/New_York';
  const seen = new Set();
  let prev = null;
  let gaps = 0;
  for (const dateStr of enumerateDates(RANGE_START, RANGE_END)) {
    const wsStr = getLocalWeekStartDateString(tz, ws, localNoon(tz, dateStr));
    if (!seen.has(wsStr)) {
      seen.add(wsStr);
      const weekday = new Date(wsStr + 'T00:00:00Z').getUTCDay();
      if (weekday !== ws) check(false, `week start ${wsStr}`, `weekday ${weekday}`);
      if (prev !== null && Math.round((new Date(wsStr).getTime() - new Date(prev).getTime()) / DAY) !== 7) {
        gaps++;
      }
      prev = wsStr;
    }
  }
  check(gaps === 0, `weekStartsOn=${ws}: week starts tile with no gaps (${seen.size} weeks)`);
}

// --- getLocalDateString sanity at extreme offsets (+14 / -12) ---
section('Date-string correctness at extreme timezones');
{
  const mid = new Date('2026-08-09T12:00:00Z').toISOString();
  check(getLocalDateString('Pacific/Kiritimati', new Date(mid)) === '2026-08-10', 'UTC noon in +14 is next local day');
  check(getLocalDateString('Etc/GMT+12', new Date(mid)) === '2026-08-09', 'UTC noon in -12 stays same local day');
}

summary();
