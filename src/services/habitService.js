const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { getLocalWeekStartDateString, addDaysToDateString, getLocalDateString } = require('../utils/profileTime');

async function listHabits(profileId) {
    const stmt = db.prepare('SELECT * FROM habits WHERE profile_id = ? AND deleted_at IS NULL ORDER BY created_at ASC');
    return stmt.all(profileId);
}

async function getHabitById(profileId, habitId) {
    const stmt = db.prepare('SELECT * FROM habits WHERE profile_id = ? AND id = ? AND deleted_at IS NULL');
    return stmt.get(profileId, habitId) || null;
}

async function createHabit(profileId, { title, target_per_week }) {
    const id = uuidv4();
    const stmt = db.prepare(`
        INSERT INTO habits (id, profile_id, title, target_per_week, deleted_at, created_at)
        VALUES (?, ?, ?, ?, NULL, datetime('now'))
    `);
    stmt.run(id, profileId, title, target_per_week ?? 7);
    return getHabitById(profileId, id);
}

async function updateHabit(profileId, habitId, fields) {
    const current = await getHabitById(profileId, habitId);
    if (!current) return null;

    const title = fields.title !== undefined ? fields.title : current.title;
    const target = fields.target_per_week !== undefined ? fields.target_per_week : current.target_per_week;

    const stmt = db.prepare(`
        UPDATE habits
        SET title = ?, target_per_week = ?
        WHERE profile_id = ? AND id = ? AND deleted_at IS NULL
    `);
    stmt.run(title, target, profileId, habitId);

    return getHabitById(profileId, habitId);
}

async function softDeleteHabit(profileId, habitId) {
    const stmt = db.prepare(`
        UPDATE habits
        SET deleted_at = datetime('now')
        WHERE profile_id = ? AND id = ? AND deleted_at IS NULL
    `);
    stmt.run(profileId, habitId);
    return { id: habitId };
}

async function restoreHabit(profileId, habitId) {
    const stmt = db.prepare(`
        UPDATE habits
        SET deleted_at = NULL
        WHERE profile_id = ? AND id = ?
    `);
    stmt.run(profileId, habitId);
    return getHabitById(profileId, habitId);
}

async function hardDeleteHabit(profileId, habitId) {
    db.prepare('DELETE FROM habit_logs WHERE habit_id = ? AND profile_id = ?').run(habitId, profileId);
    db.prepare('DELETE FROM habits WHERE profile_id = ? AND id = ?').run(profileId, habitId);
}

function daysBetween(aStr, bStr) {
    const [y1, m1, d1] = aStr.split('-').map(Number);
    const [y2, m2, d2] = bStr.split('-').map(Number);
    const t1 = Date.UTC(y1, m1 - 1, d1);
    const t2 = Date.UTC(y2, m2 - 1, d2);
    return Math.round((t2 - t1) / (24 * 60 * 60 * 1000));
}

function getStreakWindow(timeZone, weekStartsOn, now = new Date()) {
    const currentWeekStart = getLocalWeekStartDateString(timeZone, weekStartsOn, now);
    return {
        windowStart: addDaysToDateString(currentWeekStart, -51 * 7),
        windowEnd: addDaysToDateString(currentWeekStart, 6),
    };
}

async function getCompletedLogs(profileId, timeZone, weekStartsOn, habitId = null, now = new Date()) {
    const { windowStart, windowEnd } = getStreakWindow(timeZone, weekStartsOn, now);
    let sql = `
        SELECT habit_id, log_date FROM habit_logs
        WHERE profile_id = ? AND completed = 1 AND log_date >= ? AND log_date <= ?
    `;
    const params = [profileId, windowStart, windowEnd];
    if (habitId) {
        sql += ' AND habit_id = ?';
        params.push(habitId);
    }

    const stmt = db.prepare(sql);
    return stmt.all(...params);
}

function buildHabitLogIndex(logs) {
    const index = new Map();
    for (const log of logs) {
        if (!index.has(log.habit_id)) index.set(log.habit_id, new Set());
        index.get(log.habit_id).add(log.log_date);
    }
    return index;
}

function countInWeek(dateSet, weekStartStr) {
    let count = 0;
    for (let d = 0; d < 7; d++) {
        if (dateSet.has(addDaysToDateString(weekStartStr, d))) count++;
    }
    return count;
}

function weeklyCountForDates(dateSet, timeZone, weekStartsOn, now = new Date()) {
    const weekStartStr = getLocalWeekStartDateString(timeZone, weekStartsOn, now);
    return countInWeek(dateSet, weekStartStr);
}

function computeStreakForDates(dateSet, targetPerWeek, timeZone, weekStartsOn, now = new Date()) {
    let streak = 0;
    let weekStartStr = getLocalWeekStartDateString(timeZone, weekStartsOn, now);
    const todayStr = getLocalDateString(timeZone, now);

    for (let i = 0; i < 52; i++) {
        const weekEndStr = addDaysToDateString(weekStartStr, 6);
        const count = countInWeek(dateSet, weekStartStr);

        if (i === 0) {
            const daysLeftInWeek = daysBetween(todayStr, weekEndStr) + 1;
            const possibleTotal = count + daysLeftInWeek;
            if (possibleTotal < targetPerWeek && count < targetPerWeek) {
                break;
            }
        } else {
            if (count < targetPerWeek) break;
        }

        if (count >= targetPerWeek) streak++;

        weekStartStr = addDaysToDateString(weekStartStr, -7);
    }

    return streak;
}

module.exports = {
    listHabits,
    getHabitById,
    createHabit,
    updateHabit,
    softDeleteHabit,
    restoreHabit,
    hardDeleteHabit,
    getCompletedLogs,
    buildHabitLogIndex,
    weeklyCountForDates,
    computeStreakForDates,
};