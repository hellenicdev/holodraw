const express = require('express');
const router = express.Router();
const {
  createBoard,
  joinBoard,
  getBoard,
  saveBoard,
  listBoards,
  getBoardHistory
} = require('../controllers/boardController');
const { protect } = require('../middleware/auth');

router.post('/', protect, createBoard);
router.get('/', protect, listBoards);
router.post('/:roomId/join', protect, joinBoard);
router.get('/:roomId', protect, getBoard);
router.put('/:roomId', protect, saveBoard);
router.get('/:roomId/history', protect, getBoardHistory);

module.exports = router;
