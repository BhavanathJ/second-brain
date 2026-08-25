const express = require('express');
const adminController = require('../controllers/adminController');
const { requireAuth, requireAdmin } = require('../middleware/requireAuth');

const router = express.Router();

// All admin routes require auth and ADMIN role
router.use(requireAuth, requireAdmin);

router.get('/settings', adminController.getSettings);
router.patch('/settings', adminController.updateSettings);
router.get('/locked-accounts', adminController.getLockedAccounts);
router.post('/reset-lockout', adminController.resetLockout);


router.get('/users', adminController.getUsers);
router.post('/users', adminController.createUser);
router.patch('/users/:id', adminController.updateUser);
router.post('/users/:id/reset-password', adminController.resetPassword);
router.delete('/users/:id', adminController.deleteUser);
router.post('/users/:id/impersonate', adminController.impersonateUser);

module.exports = router;
