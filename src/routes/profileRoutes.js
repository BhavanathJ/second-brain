const express = require('express');
const profileController = require('../controllers/profileController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

router.get('/', profileController.listProfiles);
router.post('/', profileController.createProfile);
router.post('/:id/select', profileController.selectProfile);
router.patch('/:id', profileController.renameProfile);
router.delete('/:id', profileController.deleteProfile);

module.exports = router;