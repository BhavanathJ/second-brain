const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { requireAuth } = require('../middleware/requireAuth');

router.use(requireAuth);

router.get('/context', aiController.getContext);
router.post('/chat', aiController.chat);
router.post('/test', aiController.testConnection);
router.post('/models', aiController.getModels);

module.exports = router;
