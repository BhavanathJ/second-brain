const express = require('express');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/requireAuth');
const {
    loginLimiter,
    signupLimiter,
    refreshLimiter,
    changePasswordLimiter,
} = require('../middleware/rateLimiters');

const router = express.Router();

// Public — no token needed
router.post('/signup', signupLimiter, authController.signup);
router.post('/login', loginLimiter, authController.login);
router.post('/refresh', refreshLimiter, authController.refresh);
router.post('/logout', authController.logout);

// Protected — must be logged in to change your own password
router.patch('/password', requireAuth, changePasswordLimiter, authController.changePassword);

module.exports = router;