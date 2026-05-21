const Board = require('../models/Board');
const BoardHistory = require('../models/BoardHistory');

exports.createBoard = async (req, res) => {
  try {
    const { name, roomId } = req.body;
    const board = await Board.create({
      roomId: roomId || Math.random().toString(36).substring(2, 8).toUpperCase(),
      name: name || 'Untitled Board',
      createdBy: req.user?._id,
      layers: [{ name: 'Layer 1', visible: true, locked: false, zIndex: 0 }]
    });
    res.status(201).json(board);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create board' });
  }
};

exports.getBoard = async (req, res) => {
  try {
    const board = await Board.findOne({ roomId: req.params.roomId });
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    res.json(board);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch board' });
  }
};

exports.saveBoard = async (req, res) => {
  try {
    const board = await Board.findOne({ roomId: req.params.roomId });
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    if (req.body.strokes) board.strokes = req.body.strokes;
    if (req.body.stickyNotes) board.stickyNotes = req.body.stickyNotes;
    if (req.body.name) board.name = req.body.name;

    await board.save();
    res.json(board);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save board' });
  }
};

exports.listBoards = async (req, res) => {
  try {
    const boards = await Board.find({
      $or: [
        { createdBy: req.user?._id },
        { collaborators: req.user?._id },
        { isPublic: true }
      ]
    }).sort({ updatedAt: -1 }).limit(50);
    res.json(boards);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list boards' });
  }
};

exports.getBoardHistory = async (req, res) => {
  try {
    const board = await Board.findOne({ roomId: req.params.roomId });
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    const history = await BoardHistory.find({ boardId: board._id })
      .sort({ timestamp: -1 })
      .limit(100);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
};
