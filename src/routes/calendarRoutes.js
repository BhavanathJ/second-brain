const express = require('express');
const calendarController = require('../controllers/calendarController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

// GET /api/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
// Returns: { tasks, habitLogs, calendarEvents, reminders }
// Frontend uses this for month/week/day views.
// Toggle filters (show/hide tasks, habits etc.) are frontend-only -
// all data is returned, frontend decides what to render.
router.get('/', calendarController.getCalendarData);

module.exports = router;