// Frontend DST regression suite. Loads the REAL frontend/js/timeUtils.js
// (an ES-module file inside a CommonJS package, so it's imported through a
// `data:` URL rather than `require`d) and cross-checks its day/week/month
// bounds against the corrected backend math (src/utils/profileTime.js) on
// DST-transition days.
//
// The four functions in timeUtils.js were all ported from profileTime.js
// with the same two bugs: a single-pass noon-guess midnight and `+24h - 1ms`
// bounds ends. The backend was fixed; the frontend copy was not. This suite
// covers all three bounds functions (day, week, month) plus the midnight
// helper they share, and asserts the old formulas are provably wrong on the
// DST days they'd have drifted on.

const fs = require('fs');
const path = require('path');

async function loadFrontendTimeUtils() {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'frontend', 'js', 'timeUtils.js'),
    'utf8'
  );
  return await import('data:text/javascript,' + encodeURIComponent(source));
}

const { check, section, summary } = require('./helpers');
const {
  getLocalMidnightUTC,
  addDaysToDateString,
} = require('../src/utils/profileTime');

const HOUR = 3600 * 1000;
const TZ = 'America/New_York';

function fmt(iso) {
  return iso.slice(0, 19).replace('T', ' ') + 'Z';
}

// What the OLD frontend code computed: single midnight + literal 24h - 1ms.
function oldEnd(midnightInstant) {
  return new Date(midnightInstant.getTime() + 24 * HOUR - 1);
}

(async () => {
  const tu = await loadFrontendTimeUtils();

  section('Day bounds on DST days - frontend vs backend');
  {
    const cases = [
      ['2026-03-08', 'spring-forward (23h day)', 23],
      ['2026-11-01', 'fall-back (25h day)', 25],
      ['2026-08-09', 'normal day', 24],
    ];
    for (const [dateStr, label, trueLen] of cases) {
      const fe = tu.getLocalDayBounds(TZ, dateStr);
      const start = getLocalMidnightUTC(TZ, dateStr);
      const beEnd = new Date(getLocalMidnightUTC(TZ, addDaysToDateString(dateStr, 1)).getTime() - 1);
      const feLen = (new Date(fe.endISO) - new Date(fe.startISO) + 1) / HOUR;
      const beLen = (beEnd.getTime() - start.getTime() + 1) / HOUR;

      const startDeltaH = (new Date(fe.startISO) - start.getTime()) / HOUR;
      const endDeltaH = (new Date(fe.endISO) - beEnd.getTime()) / HOUR;

      console.log(`  ${dateStr} (${label}):`);
      console.log(`    frontend day bounds = [${fmt(fe.startISO)}, ${fmt(fe.endISO)}]  length ${feLen}h`);
      console.log(`    drift vs backend:   start ${startDeltaH >= 0 ? '+' : ''}${startDeltaH}h, end ${endDeltaH >= 0 ? '+' : ''}${endDeltaH}h`);

      check(feLen === beLen, `frontend day length matches true ${trueLen}h (${label})`,
        `frontend ${feLen}h vs true ${beLen}h`);
      check(fe.endISO === beEnd.toISOString(), `frontend day end = next-midnight - 1ms (${label})`,
        `got ${fmt(fe.endISO)}`);
    }
  }

  section('Real user impact - no more wrong-day bucketing');
  {
    // A task due 23:30 local the night BEFORE spring-forward. The fixed
    // frontend must NOT show it on Mar-8's day view (only the backend's true
    // range excludes it); the pre-fix frontend started its Mar-8 range 1h
    // early and leaked it in.
    const mar7Night = new Date('2026-03-08T04:30:00Z'); // = 2026-03-07 23:30 EST
    const fe = tu.getLocalDayBounds(TZ, '2026-03-08');
    const beEnd = new Date(getLocalMidnightUTC(TZ, '2026-03-09').getTime() - 1);
    const inFe = mar7Night >= new Date(fe.startISO) && mar7Night <= new Date(fe.endISO);
    const inBe = mar7Night >= getLocalMidnightUTC(TZ, '2026-03-08').getTime() && mar7Night <= beEnd.getTime();
    check(!inFe && !inBe, '23:30 item no longer leaks onto Mar-8', `fe=${inFe} be=${inBe}`);
  }

  section('Week bounds on a DST-transition week (weekStartsOn=1)');
  {
    // weekStartsOn=1 puts the transition SUNDAY as weekEndStr, so the old
    // `midnight(weekEnd) + 24h` formula drifted ±1h on those weeks.
    const cases = [
      ['2026-03-08', 'spring-forward week'],
      ['2026-11-01', 'fall-back week'],
    ];
    for (const [dateStr, label] of cases) {
      const wb = tu.getLocalWeekBounds(TZ, 1, dateStr);
      const trueEnd = new Date(getLocalMidnightUTC(TZ, addDaysToDateString(wb.weekEndStr, 1)).getTime() - 1);
      const wrong = oldEnd(getLocalMidnightUTC(TZ, wb.weekEndStr));

      check(wb.endISO === trueEnd.toISOString(), `${label}: week end = day-after midnight - 1ms`,
        `got ${fmt(wb.endISO)}`);
      check(wrong.getTime() !== trueEnd.getTime(), `${label}: OLD +24h formula was provably wrong`,
        `old ${fmt(wrong.toISOString())}`);
    }
    // Normal week unaffected.
    const wb = tu.getLocalWeekBounds(TZ, 1, '2026-08-09');
    const trueEnd = new Date(getLocalMidnightUTC(TZ, addDaysToDateString(wb.weekEndStr, 1)).getTime() - 1);
    check(wb.endISO === trueEnd.toISOString(), 'normal week end exact', `got ${fmt(wb.endISO)}`);
  }

  section('Month bounds - 10-year scan where last day of month hits a transition (Europe/Berlin)');
  {
    // Berlin transitions on the LAST Sunday of March and October, so a month
    // whose last day IS that Sunday is the case the old month formula got
    // wrong. Scan a decade to prove the fixed formula is exact everywhere
    // and that such months actually exist in the window.
    const MZ = 'Europe/Berlin';
    let checked = 0;
    let oldWrongMonths = [];
    for (let y = 2025; y <= 2035; y++) {
      for (let m = 1; m <= 12; m++) {
        const monthStr = `${y}-${String(m).padStart(2, '0')}`;
        const mb = tu.getLocalMonthBounds(MZ, `${monthStr}-01`);
        const lastOfMonthStr = `${monthStr}-${String(mb.daysInMonth).padStart(2, '0')}`;
        const firstNext = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
        const trueEnd = new Date(getLocalMidnightUTC(MZ, firstNext).getTime() - 1);
        const wrong = oldEnd(getLocalMidnightUTC(MZ, lastOfMonthStr));

        if (wrong.getTime() !== trueEnd.getTime()) oldWrongMonths.push(monthStr);
        checked++;
        check(mb.endISO === trueEnd.toISOString(), `month ${monthStr}: end = next-midnight - 1ms`,
          `got ${fmt(mb.endISO)}`);
      }
    }
    check(checked === 132, `scanned ${checked} months`);
    check(oldWrongMonths.length >= 1, `scan contains months the OLD +24h formula got wrong`,
      `${oldWrongMonths.join(', ')}`);
  }

  summary();
})();
