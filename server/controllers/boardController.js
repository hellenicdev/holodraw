const Board = require('../models/Board');
const BoardHistory = require('../models/BoardHistory');
const {
  generateRoomId,
  normalizeRoomId,
  isBoardMember,
  validateStrokeList,
  validateStickyList
} = require('../utils/validate');

const cleanName = (value) => {
  if (typeof value !== 'string') return null;
  const name = value.trim().slice(0, 80);
  return name || null;
};

exports.createBoard = async (req, res) => {
  try {
    const name = cleanName(req.body && req.body.name) || 'Untitled Board';
    if (req.body && req.body.name !== undefined && typeof req.body.name !== 'string') {
      return res.status(400).json({ error: 'Invalid board name' });
    }

    const board = await Board.create({
      roomId: generateRoomId(),
      name,
      createdBy: req.user._id,
      layers: [{ name: 'Layer 1', visible: true, locked: false, zIndex: 0 }]
    });
    return res.status(201).json(board);
  } catch (error) {
    console.error('Create board error:', error.message);
    return res.status(500).json({ error: 'Failed to create board' });
  }
};

exports.joinBoard = async (req, res) => {
  try {
    const roomId = normalizeRoomId(req.params.roomId);
    if (!roomId) {
      return res.status(400).json({ error: 'Invalid room id' });
    }

    const board = await Board.findOne({ roomId });
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    if (!isBoardMember(board, req.user._id)) {
      board.collaborators.push(req.user._id);
      await board.save();
    }

    return res.json({ roomId: board.roomId, name: board.name });
  } catch (error) {
    console.error('Join board error:', error.message);
    return res.status(500).json({ error: 'Failed to join board' });
  }
};

exports.getBoard = async (req, res) => {
  try {
    const roomId = normalizeRoomId(req.params.roomId);
    if (!roomId) {
      return res.status(400).json({ error: 'Invalid room id' });
    }

    const board = await Board.findOne({ roomId });
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    if (!isBoardMember(board, req.user._id) && !board.isPublic) {
      return res.status(403).json({ error: 'Not allowed to view this board' });
    }
    return res.json(board);
  } catch (error) {
    console.error('Fetch board error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch board' });
  }
};

exports.saveBoard = async (req, res) => {
  try {
    const roomId = normalizeRoomId(req.params.roomId);
    if (!roomId) {
      return res.status(400).json({ error: 'Invalid room id' });
    }

    const board = await Board.findOne({ roomId });
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    if (!isBoardMember(board, req.user._id)) {
      return res.status(403).json({ error: 'Not allowed to edit this board' });
    }

    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    if (body.strokes !== undefined) {
      const strokes = validateStrokeList(body.strokes);
      if (!strokes) return res.status(400).json({ error: 'Invalid strokes' });
      board.strokes = strokes;
    }
    if (body.stickyNotes !== undefined) {
      const stickyNotes = validateStickyList(body.stickyNotes);
      if (!stickyNotes) return res.status(400).json({ error: 'Invalid sticky notes' });
      board.stickyNotes = stickyNotes;
    }
    if (body.name !== undefined) {
      const name = cleanName(body.name);
      if (!name) return res.status(400).json({ error: 'Invalid board name' });
      board.name = name;
    }

    await board.save();
    return res.json(board);
  } catch (error) {
    console.error('Save board error:', error.message);
    return res.status(500).json({ error: 'Failed to save board' });
  }
};

exports.listBoards = async (req, res) => {
  try {
    const boards = await Board.find({
      $or: [
        { createdBy: req.user._id },
        { collaborators: req.user._id },
        { isPublic: true }
      ]
    }).sort({ updatedAt: -1 }).limit(50);
    return res.json(boards);
  } catch (error) {
    console.error('List boards error:', error.message);
    return res.status(500).json({ error: 'Failed to list boards' });
  }
};

exports.getBoardHistory = async (req, res) => {
  try {
    const roomId = normalizeRoomId(req.params.roomId);
    if (!roomId) {
      return res.status(400).json({ error: 'Invalid room id' });
    }

    const board = await Board.findOne({ roomId });
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    if (!isBoardMember(board, req.user._id)) {
      return res.status(403).json({ error: 'Not allowed to view this board' });
    }

    const history = await BoardHistory.find({ boardId: board._id })
      .sort({ timestamp: -1 })
      .limit(100);
    return res.json(history);
  } catch (error) {
    console.error('Fetch history error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch history' });
  }
};
