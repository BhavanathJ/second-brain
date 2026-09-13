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

// Protected — must be logged in
router.post('/logout', requireAuth, authController.logout);
router.patch('/password', requireAuth, changePasswordLimiter, authController.changePassword);
router.patch('/username', requireAuth, authController.updateUsername);

module.exports = router;