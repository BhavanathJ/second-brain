// Verbatim copies of the FRONTEND date helpers from
// frontend/js/timeUtils.js (single-pass noon-offset midnight + literal
// +24h end), so we can run them in Node. Compare against the CORRECTED
// backend math (src/utils/profileTime.js) on DST-transition days.
//
// Hypothesis from the static review: these two functions were fixed on the
// backend but the frontend copies still have the old behavior, so the
// calendar's day/week/month fetch ranges drift ±1h on DST days.

function feGetOffsetMinutes(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(date).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return (asUTC - date.getTime()) / 60000;
}

// --- FRONTEND (verbatim from timeUtils.js) ---
function feGetLocalMidnightUTC(timeZone, dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guessInstant = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const offsetMinutes = feGetOffsetMinutes(guessInstant, timeZone);
  const localMidnightAsIfUTC = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  return new Date(localMidnightAsIfUTC - offsetMinutes * 60000);
}

function feGetLocalDayBounds(timeZone, dateStr) {
  const start = feGetLocalMidnightUTC(timeZone, dateStr);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

// --- BACKEND (corrected: two-pass midnight + next-midnight end) ---
const { getLocalMidnightUTC } = require('../src/utils/profileTime');
function beGetLocalDayBounds(timeZone, dateStr) {
  const start = getLocalMidnightUTC(timeZone, dateStr);
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const nextStr = next.toISOString().split('T')[0];
  const end = new Date(getLocalMidnightUTC(timeZone, nextStr).getTime() - 1);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

const { check, section, summary } = require('./helpers');
const TZ = 'America/New_York';
const HOUR = 3600 * 1000;

function fmt(iso) {
  return iso.slice(0, 19).replace('T', ' ') + 'Z';
}

section('Frontend timeUtils DST drift (documented finding)');
{
  const cases = [
    ['2026-03-08', 'spring-forward (23h day)', 23],
    ['2026-11-01', 'fall-back (25h day)', 25],
    ['2026-08-09', 'normal day', 24],
  ];
  for (const [dateStr, label, trueLen] of cases) {
    const fe = feGetLocalDayBounds(TZ, dateStr);
    const be = beGetLocalDayBounds(TZ, dateStr);
    const feLen = (new Date(fe.endISO) - new Date(fe.startISO) + 1) / HOUR;
    const beLen = (new Date(be.endISO) - new Date(be.startISO) + 1) / HOUR;

    const startDeltaH = (new Date(fe.startISO) - new Date(be.startISO)) / HOUR;
    const endDeltaH = (new Date(fe.endISO) - new Date(be.endISO)) / HOUR;

    console.log(`  ${dateStr} (${label}):`);
    console.log(`    backend  day bounds = [${fmt(be.startISO)}, ${fmt(be.endISO)}]  length ${beLen}h`);
    console.log(`    frontend day bounds = [${fmt(fe.startISO)}, ${fmt(fe.endISO)}]  length ${feLen}h`);
    console.log(`    drift: start ${startDeltaH >= 0 ? '+' : ''}${startDeltaH}h, end ${endDeltaH >= 0 ? '+' : ''}${endDeltaH}h`);

    check(beLen === trueLen, `backend: ${dateStr} is a ${trueLen}h day (${label})`, `${beLen}h`);
    check(feLen === beLen, `frontend: ${dateStr} matches backend length (${beLen}h)`,
      `frontend ${feLen}h vs backend ${beLen}h — ±1h DST drift`);
  }
}

section('Real user impact of the frontend drift');
{
  // A task due 23:30 local on the day BEFORE spring-forward: the backend's
  // Mar-8 day range starts at true Mar-8 00:00 (excludes Mar-7 23:30); the
  // frontend's range starts 1h early, so Mar-7 23:30 leaks into Mar-8's
  // view — an item rendered on the WRONG calendar day.
  const mar7Night = new Date('2026-03-08T04:30:00Z'); // = 2026-03-07 23:30 EST
  const fe = feGetLocalDayBounds(TZ, '2026-03-08');
  const be = beGetLocalDayBounds(TZ, '2026-03-08');
  const inFe = mar7Night >= new Date(fe.startISO) && mar7Night <= new Date(fe.endISO);
  const inBe = mar7Night >= new Date(be.startISO) && mar7Night <= new Date(be.endISO);

  console.log(`  item at 2026-03-07 23:30 EST:`);
  console.log(`    appears on Mar-8 in the FRONTEND day view? ${inFe}`);
  console.log(`    appears on Mar-8 in the BACKEND  day view? ${inBe}`);
  check(inFe && !inBe, 'item 1h before midnight is mis-bucketed by the frontend', `fe=${inFe} be=${inBe}`);
}

summary();
