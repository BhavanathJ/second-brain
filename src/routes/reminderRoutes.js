const express = require('express');
const reminderController = require('../controllers/reminderController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

router.get('/', reminderController.listReminders);
router.get('/:id', reminderController.getReminder);
router.post('/', reminderController.createReminder);
router.patch('/:id', reminderController.updateReminder);
router.delete('/:id', reminderController.deleteReminder);

module.exports = router;