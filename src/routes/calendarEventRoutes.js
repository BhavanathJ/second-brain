const express = require('express');
const calendarEventController = require('../controllers/calendarEventController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

router.get('/', calendarEventController.listCalendarEvents);
router.get('/:id', calendarEventController.getCalendarEvent);
router.post('/', calendarEventController.createCalendarEvent);
router.patch('/:id', calendarEventController.updateCalendarEvent);
router.delete('/:id', calendarEventController.deleteCalendarEvent);

module.exports = router;