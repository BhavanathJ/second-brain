const express = require('express');
const noteController = require('../controllers/noteController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

router.get('/', noteController.listNotes);
router.get('/:id', noteController.getNote);
router.post('/', noteController.createNote);
router.patch('/:id', noteController.updateNote);
router.delete('/:id', noteController.deleteNote);

// Separate endpoint for conversion — it's not a standard CRUD operation,
// it's a state transition with side effects (creates a task, links back).
// POST semantics are correct: it creates something new (a task).
router.post('/:id/convert', noteController.convertNoteToTask);

module.exports = router;