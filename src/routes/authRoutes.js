const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

// All public — no requireAuth here, since you don't have a token yet
// when calling any of these.
router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

module.exports = router;
