const express = require('express');
const habitController = require('../controllers/habitController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

// --- HABITS CRUD ---
router.get('/', habitController.listHabits);
router.get('/:id', habitController.getHabit);
router.post('/', habitController.createHabit);
router.patch('/:id', habitController.updateHabit);
router.delete('/:id', habitController.deleteHabit);

// --- HABIT LOGS (Option B: explicit endpoints) ---
// POST   /api/habits/:id/logs          → mark complete for a date
// DELETE /api/habits/:id/logs/:date    → unmark for a specific date
// GET    /api/habits/:id/logs?start=&end= → fetch logs for a date range
router.post('/:id/logs', habitController.logCompletion);
router.delete('/:id/logs/:date', habitController.deleteLog);
router.get('/:id/logs', habitController.getLogs);

module.exports = router;