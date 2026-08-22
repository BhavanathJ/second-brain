// Client-side timezone utilities - same algorithm as src/utils/profileTime.js
// on the backend, ported here since that file is a Node CommonJS module.
// Used wherever the frontend needs to reason about "which local calendar
// day" something falls on, or convert a local date to the correct UTC
// instant for querying the backend.

function getOffsetMinutes(date, timeZone) {
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

// 'YYYY-MM-DD' for a given instant (default: now), as read on a wall
// clock in timeZone.
export function getLocalDateString(timeZone, date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function addDays(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return dt.toISOString().split('T')[0];
}

// Moves a date string by `delta` whole months, clamping the day if the
// target month is shorter (e.g. Jan 31 + 1 month -> Feb 28/29, not
// rolling over into March).
export function addMonths(dateStr, delta) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const targetYear = y + Math.floor((m - 1 + delta) / 12);
    const targetMonth = ((m - 1 + delta) % 12 + 12) % 12;
    const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    const clampedDay = Math.min(d, daysInTargetMonth);
    return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

// UTC Date instance for local midnight of the given 'YYYY-MM-DD' in
// timeZone. Offset is derived from the target date itself (not "now"),
// so this stays correct across DST boundaries.
export function getLocalMidnightUTC(timeZone, dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);

    // Iterate to find the UTC instant whose local wall-clock is exactly
    // 00:00:00 on the target date. Sampling the offset once at a noon
    // guess is wrong on DST-transition days, where the offset at actual
    // midnight differs from the offset at noon. Two passes converge: the
    // second pass re-samples the offset at the corrected midnight instead
    // of the noon guess.
    let guessInstant = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    let midnight = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    for (let i = 0; i < 2; i++) {
        const offsetMinutes = getOffsetMinutes(guessInstant, timeZone);
        midnight = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - offsetMinutes * 60000);
        guessInstant = midnight;
    }
    return midnight;
}

// { startISO, endISO } spanning the entire local calendar month
// containing `dateStr` - for GET /api/calendar?start=&end=.
export function getLocalMonthBounds(timeZone, dateStr) {
    const [y, m] = dateStr.split('-').map(Number);
    const firstOfMonth = `${y}-${String(m).padStart(2, '0')}-01`;
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

    const start = getLocalMidnightUTC(timeZone, firstOfMonth);
    // End = the first midnight of the NEXT month - 1ms, not
    // midnight(lastOfMonth) + literal 24h. If the last day of the month is
    // a DST-transition day, that final "day" isn't exactly 24h long, so
    // anchoring on the next month's own midnight keeps the boundary exact.
    const firstOfNextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const end = new Date(getLocalMidnightUTC(timeZone, firstOfNextMonth).getTime() - 1);

    return { startISO: start.toISOString(), endISO: end.toISOString(), daysInMonth };
}

// { startISO, endISO } spanning a single local calendar day.
export function getLocalDayBounds(timeZone, dateStr) {
    const start = getLocalMidnightUTC(timeZone, dateStr);
    // End = the NEXT local midnight - 1ms, not start + literal 24h - a
    // local day isn't exactly 24h across DST transitions.
    const nextStr = addDays(dateStr, 1);
    const end = new Date(getLocalMidnightUTC(timeZone, nextStr).getTime() - 1);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
}

// Local-week-start date string containing `dateStr`, honoring
// weekStartsOn (0=Sunday..6=Saturday) - same convention as the
// backend's habit-week calculations and the profile's settings.week_starts_on.
export function getLocalWeekStartDateString(timeZone, weekStartsOn, dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const asUTCDate = new Date(Date.UTC(y, m - 1, d));
    const localDay = asUTCDate.getUTCDay();
    const diff = (localDay - weekStartsOn + 7) % 7;
    asUTCDate.setUTCDate(asUTCDate.getUTCDate() - diff);
    return asUTCDate.toISOString().split('T')[0];
}

// { startISO, endISO, weekStartStr, weekEndStr } spanning the local
// calendar week containing `dateStr`.
export function getLocalWeekBounds(timeZone, weekStartsOn, dateStr) {
    const weekStartStr = getLocalWeekStartDateString(timeZone, weekStartsOn, dateStr);
    const weekEndStr = addDays(weekStartStr, 6);
    const start = getLocalMidnightUTC(timeZone, weekStartStr);
    // End = the first midnight of the day AFTER the week ends - 1ms, not
    // midnight(weekEndStr) + literal 24h - same DST reasoning as the other
    // bounds functions.
    const dayAfterWeekEnd = addDays(weekEndStr, 1);
    const end = new Date(getLocalMidnightUTC(timeZone, dayAfterWeekEnd).getTime() - 1);
    return { startISO: start.toISOString(), endISO: end.toISOString(), weekStartStr, weekEndStr };
}