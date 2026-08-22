const express = require('express');
const binController = require('../controllers/binController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

router.get('/', binController.listBin);

// POST to restore - it's creating a "restoration event", bringing
// something back to life, which is semantically a POST not a PATCH.
router.post('/:id/restore', binController.restoreEntry);

// DELETE to permanently delete - matches HTTP semantics exactly.
router.delete('/:id', binController.permanentDelete);

module.exports = router;