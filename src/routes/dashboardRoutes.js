const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

// Single endpoint — returns everything the Dashboard page needs.
// No query params needed — date ranges are computed server-side
// (today, tomorrow, rolling 7 days from now).
router.get('/', dashboardController.getDashboard);

module.exports = router;