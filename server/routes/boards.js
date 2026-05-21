const express = require('express');
const router = express.Router();
const { createBoard, getBoard, saveBoard, listBoards, getBoardHistory } = require('../controllers/boardController');
const { protect, optionalAuth } = require('../middleware/auth');

router.post('/', optionalAuth, createBoard);
router.get('/', protect, listBoards);
router.get('/:roomId', optionalAuth, getBoard);
router.put('/:roomId', optionalAuth, saveBoard);
router.get('/:roomId/history', optionalAuth, getBoardHistory);

module.exports = router;
