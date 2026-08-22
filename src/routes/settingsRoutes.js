const express = require('express');
const settingsController = require('../controllers/settingsController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

// Only two operations on settings - read and update.
// No POST (created at signup), no DELETE (lives as long as the profile).
router.get('/', settingsController.getSettings);
router.patch('/', settingsController.updateSettings);

module.exports = router;