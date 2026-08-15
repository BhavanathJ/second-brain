const habitService = require('../services/habitService');
const habitLogService = require('../services/habitLogService');
const binService = require('../services/binService');
const settingsService = require('../services/settingsService');
const { getLocalDateString } = require('../utils/profileTime');

async function listHabits(req, res) {
    try {
        const settings = await settingsService.getSettings(req.profileId);
        const { timezone, week_starts_on } = settings;

        const habits = await habitService.listHabits(req.profileId);

        // ONE logs query for all habits, indexed by habit_id. The weekly
        // counts and streaks are pure date-math on the fetched dates
        // (previously this issued ~53 queries per habit, one per week).
        const logs = await habitService.getCompletedLogs(req.profileId, timezone, week_starts_on);
        const logIndex = habitService.buildHabitLogIndex(logs);

        const habitsWithProgress = habits.map((habit) => {
            const dateSet = logIndex.get(habit.id) ?? new Set();
            const weeklyCount = habitService.weeklyCountForDates(dateSet, timezone, week_starts_on);
            const streak = habitService.computeStreakForDates(dateSet, habit.target_per_week, timezone, week_starts_on);
            return {
                ...habit,
                this_week_count: weeklyCount,
                weekly_goal_met: weeklyCount >= habit.target_per_week,
                streak,
            };
        });

        return res.status(200).json({ habits: habitsWithProgress });
    } catch (err) {
        console.error('List habits error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function getHabit(req, res) {
    try {
        const habit = await habitService.getHabitById(req.profileId, req.params.id);
        if (!habit) {
            return res.status(404).json({ error: 'Habit not found.' });
        }

        const settings = await settingsService.getSettings(req.profileId);
        const { timezone, week_starts_on } = settings;

        const logs = await habitService.getCompletedLogs(req.profileId, timezone, week_starts_on, habit.id);
        const dateSet = habitService.buildHabitLogIndex(logs).get(habit.id) ?? new Set();
        const weeklyCount = habitService.weeklyCountForDates(dateSet, timezone, week_starts_on);
        const streak = habitService.computeStreakForDates(dateSet, habit.target_per_week, timezone, week_starts_on);

        return res.status(200).json({
            habit: {
                ...habit,
                this_week_count: weeklyCount,
                weekly_goal_met: weeklyCount >= habit.target_per_week,
                streak,
            },
        });
    } catch (err) {
        console.error('Get habit error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function createHabit(req, res) {
    // target_per_week now matches updateHabit's field name — previously
    // camelCase here (targetPerWeek) while update used snake_case,
    // same mismatch pattern as tasks/reminders/calendar_events had.
    const { title, target_per_week } = req.body;

    if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Title is required.' });
    }
    if (target_per_week !== undefined) {
        const n = Number(target_per_week);
        if (!Number.isInteger(n) || n < 1 || n > 7) {
            return res.status(400).json({ error: 'target_per_week must be an integer between 1 and 7.' });
        }
    }

    try {
        const habit = await habitService.createHabit(req.profileId, {
            title: title.trim(),
            target_per_week,
        });
        return res.status(201).json({ habit });
    } catch (err) {
        console.error('Create habit error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function updateHabit(req, res) {
    const allowedFields = ['title', 'target_per_week'];
    const fields = {};

    for (const key of allowedFields) {
        if (req.body[key] !== undefined) fields[key] = req.body[key];
    }

    if (Object.keys(fields).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update.' });
    }

    if (fields.target_per_week !== undefined) {
        const n = Number(fields.target_per_week);
        if (!Number.isInteger(n) || n < 1 || n > 7) {
            return res.status(400).json({ error: 'target_per_week must be an integer between 1 and 7.' });
        }
    }

    try {
        const habit = await habitService.updateHabit(req.profileId, req.params.id, fields);
        if (!habit) {
            return res.status(404).json({ error: 'Habit not found.' });
        }
        return res.status(200).json({ habit });
    } catch (err) {
        console.error('Update habit error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function deleteHabit(req, res) {
    try {
        const habit = await habitService.softDeleteHabit(req.profileId, req.params.id);
        if (!habit) {
            return res.status(404).json({ error: 'Habit not found.' });
        }
        await binService.logDeletion(req.profileId, 'habit', habit.id);
        return res.status(204).send();
    } catch (err) {
        console.error('Delete habit error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function logCompletion(req, res) {
    try {
        const habit = await habitService.getHabitById(req.profileId, req.params.id);
        if (!habit) {
            return res.status(404).json({ error: 'Habit not found.' });
        }

        let date = req.body.date;
        if (!date) {
            const settings = await settingsService.getSettings(req.profileId);
            date = getLocalDateString(settings.timezone);
        }

        const log = await habitLogService.createLog(habit.id, req.profileId, date);
        return res.status(201).json({ log });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Habit already logged for this date.' });
        }
        console.error('Log completion error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function deleteLog(req, res) {
    const { date } = req.params;

    try {
        const habit = await habitService.getHabitById(req.profileId, req.params.id);
        if (!habit) {
            return res.status(404).json({ error: 'Habit not found.' });
        }

        const deleted = await habitLogService.deleteLog(habit.id, req.profileId, date);
        if (!deleted) {
            return res.status(404).json({ error: 'No log found for this date.' });
        }

        return res.status(204).send();
    } catch (err) {
        console.error('Delete log error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

async function getLogs(req, res) {
    const { start, end } = req.query;

    if (!start || !end) {
        return res.status(400).json({ error: 'start and end query params are required (YYYY-MM-DD).' });
    }

    try {
        const habit = await habitService.getHabitById(req.profileId, req.params.id);
        if (!habit) {
            return res.status(404).json({ error: 'Habit not found.' });
        }

        const logs = await habitLogService.getLogsForRange(habit.id, req.profileId, start, end);
        return res.status(200).json({ logs });
    } catch (err) {
        console.error('Get logs error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

module.exports = {
    listHabits,
    getHabit,
    createHabit,
    updateHabit,
    deleteHabit,
    logCompletion,
    deleteLog,
    getLogs,
};