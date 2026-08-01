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

function getLocalDateString(timeZone, date = new Date()) {
    const offsetMinutes = getOffsetMinutes(date, timeZone);
    const shifted = new Date(date.getTime() + offsetMinutes * 60000);
    const y = shifted.getUTCFullYear();
    const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const d = String(shifted.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getLocalMidnightUTC(timeZone, dateStr = null) {
    const targetDateStr = dateStr ?? getLocalDateString(timeZone);
    const [y, m, d] = targetDateStr.split('-').map(Number);
    const guessInstant = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const offsetMinutes = getOffsetMinutes(guessInstant, timeZone);
    const localMidnightAsIfUTC = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
    return new Date(localMidnightAsIfUTC - offsetMinutes * 60000);
}

function getLocalDayBounds(timeZone, daysOffset = 0) {
    const todayStr = getLocalDateString(timeZone);
    const [y, m, d] = todayStr.split('-').map(Number);
    const targetDate = new Date(Date.UTC(y, m - 1, d + daysOffset));
    const targetStr = targetDate.toISOString().split('T')[0];

    const start = getLocalMidnightUTC(timeZone, targetStr);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    return { start: start.toISOString(), end: end.toISOString() };
}

function getLocalRangeBounds(timeZone, days) {
    const start = getLocalDayBounds(timeZone, 0).start;
    const end = getLocalDayBounds(timeZone, days - 1).end;
    return { start, end };
}

// Pure calendar-date arithmetic, no timezone conversion needed —
// just moving N days along a date string.
function addDaysToDateString(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return dt.toISOString().split('T')[0];
}

// The local week-start as a 'YYYY-MM-DD' string, not a UTC instant —
// what habit_logs.log_date comparisons need directly, since log_date
// is a DATE column with no time component.
function getLocalWeekStartDateString(timeZone, weekStartsOn, date = new Date()) {
    const dateStr = getLocalDateString(timeZone, date);
    const [y, m, d] = dateStr.split('-').map(Number);
    const asUTCDate = new Date(Date.UTC(y, m - 1, d));
    const localDay = asUTCDate.getUTCDay();
    const diff = (localDay - weekStartsOn + 7) % 7;
    asUTCDate.setUTCDate(asUTCDate.getUTCDate() - diff);
    return asUTCDate.toISOString().split('T')[0];
}

// UTC instant of the local-week start — built on the date-string
// version above, same result as before, just no duplicated week-math.
function getLocalWeekStart(timeZone, weekStartsOn, date = new Date()) {
    const weekStartStr = getLocalWeekStartDateString(timeZone, weekStartsOn, date);
    return getLocalMidnightUTC(timeZone, weekStartStr);
}

module.exports = {
    getLocalDateString,
    getLocalMidnightUTC,
    getLocalDayBounds,
    getLocalRangeBounds,
    getLocalWeekStart,
    getLocalWeekStartDateString,
    addDaysToDateString,
};