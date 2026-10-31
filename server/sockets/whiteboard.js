const cookie = require('cookie');
const Board = require('../models/Board');
const BoardHistory = require('../models/BoardHistory');
const User = require('../models/User');
const { verifyAccessToken } = require('../utils/tokens');
const {
  MAX_STROKES,
  MAX_STICKY_NOTES,
  isHexColor,
  sanitizeName,
  normalizeRoomId,
  isBoardMember,
  validateStroke,
  validateStickyNote,
  validateStickyPatch
} = require('../utils/validate');

const rooms = new Map();

const plainBoardValue = (value) => {
  if (value && typeof value.toObject === 'function') return value.toObject();
  return value;
};

const authenticateSocket = async (socket, next) => {
  try {
    const rawCookie = socket.handshake.headers && socket.handshake.headers.cookie;
    const cookies = cookie.parse(typeof rawCookie === 'string' ? rawCookie : '');
    const decoded = verifyAccessToken(cookies.accessToken);
    if (!decoded) return next(new Error('Authentication required'));

    const user = await User.findById(decoded.id);
    if (!user) return next(new Error('Authentication required'));

    socket.data.userId = user._id.toString();
    socket.data.username = sanitizeName(user.username);
    socket.data.color = isHexColor(user.color) ? user.color : '#666666';
    return next();
  } catch (err) {
    return next(new Error('Authentication required'));
  }
};

const authorizedRoom = (socket) => {
  const roomId = socket.data.roomId;
  if (!roomId || !socket.rooms.has(roomId)) return null;
  return roomId;
};

const requireMember = async (socket) => {
  const roomId = authorizedRoom(socket);
  if (!roomId) return null;
  const board = await Board.findOne({ roomId }).select('createdBy collaborators');
  if (!board || !isBoardMember(board, socket.data.userId)) {
    socket.leave(roomId);
    socket.data.roomId = null;
    socket.emit('action-error', { error: 'Not allowed in this room' });
    return null;
  }
  return roomId;
};

const persistRoom = async (roomId, roomState, userId, username) => {
  try {
    const board = await Board.findOne({ roomId });
    if (!board || !isBoardMember(board, userId)) return;
    board.strokes = roomState.strokes.slice(0, MAX_STROKES);
    board.stickyNotes = roomState.stickyNotes.slice(0, MAX_STICKY_NOTES);
    await board.save();
    try {
      await BoardHistory.create({
        boardId: board._id,
        action: 'board_saved',
        data: {
          strokeCount: board.strokes.length,
          noteCount: board.stickyNotes.length
        },
        userId,
        username,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('Board history error:', err.message);
    }
  } catch (err) {
    console.error('Save board error:', err.message);
  }
};

const setupWhiteboardSocket = (io) => {
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    socket.on('join-room', async (payload) => {
      try {
        const requested = payload && typeof payload === 'object' ? payload.roomId : null;
        const roomId = normalizeRoomId(requested);
        if (!roomId) {
          socket.emit('join-error', { error: 'Invalid room id' });
          return;
        }

        const board = await Board.findOne({ roomId });
        if (!board || !isBoardMember(board, socket.data.userId)) {
          socket.emit('join-error', { error: 'Not allowed in this room' });
          return;
        }

        if (socket.data.roomId && socket.data.roomId !== roomId) {
          const previous = rooms.get(socket.data.roomId);
          if (previous) {
            previous.users.delete(socket.id);
            socket.to(socket.data.roomId).emit('user-left', socket.id);
            socket.to(socket.data.roomId).emit('room-users', Array.from(previous.users.values()));
          }
          socket.leave(socket.data.roomId);
        }

        if (!rooms.has(roomId)) {
          const strokes = (board.strokes || []).map(plainBoardValue).slice(-MAX_STROKES);
          const stickyNotes = (board.stickyNotes || []).map(plainBoardValue).slice(-MAX_STICKY_NOTES);
          rooms.set(roomId, { users: new Map(), strokes, stickyNotes });
        }

        socket.join(roomId);
        socket.data.roomId = roomId;

        const roomState = rooms.get(roomId);
        const profile = {
          id: socket.id,
          username: socket.data.username,
          userId: socket.data.userId,
          color: socket.data.color
        };
        roomState.users.set(socket.id, { ...profile, lastActive: Date.now() });

        socket.emit('board-state', {
          strokes: roomState.strokes,
          stickyNotes: roomState.stickyNotes,
          users: Array.from(roomState.users.values())
        });
        socket.to(roomId).emit('user-joined', profile);
        io.to(roomId).emit('room-users', Array.from(roomState.users.values()));
      } catch (err) {
        console.error('Join room error:', err.message);
        socket.emit('join-error', { error: 'Unable to join room' });
      }
    });

    socket.on('draw', (data) => {
      const roomId = authorizedRoom(socket);
      if (!roomId) return;
      const stroke = validateStroke(data);
      if (!stroke) {
        socket.emit('action-error', { error: 'Invalid drawing' });
        return;
      }
      const roomState = rooms.get(roomId);
      if (!roomState) return;
      if (roomState.strokes.length >= MAX_STROKES) {
        socket.emit('action-error', { error: 'This board has reached the stroke limit' });
        return;
      }
      stroke.userId = socket.data.userId;
      stroke.username = socket.data.username;
      roomState.strokes.push(stroke);
      socket.to(roomId).emit('draw', stroke);
    });

    socket.on('cursor-move', (data) => {
      const roomId = authorizedRoom(socket);
      if (!roomId || !data || typeof data !== 'object' || Array.isArray(data)) return;
      const x = data.x;
      const y = data.y;
      if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return;
      if (Math.abs(x) > 1e6 || Math.abs(y) > 1e6) return;
      socket.to(roomId).emit('cursor-move', {
        x,
        y,
        id: socket.id,
        username: socket.data.username,
        color: socket.data.color
      });
    });

    socket.on('undo', () => {
      const roomId = authorizedRoom(socket);
      if (!roomId) return;
      const roomState = rooms.get(roomId);
      if (!roomState) return;
      const removed = roomState.strokes.pop();
      if (removed) socket.to(roomId).emit('undo');
    });

    socket.on('redo', () => {
      const roomId = authorizedRoom(socket);
      if (!roomId) return;
      socket.to(roomId).emit('redo');
    });

    socket.on('clear-board', async () => {
      const roomId = await requireMember(socket);
      if (!roomId) return;
      const roomState = rooms.get(roomId);
      if (!roomState) return;
      roomState.strokes = [];
      roomState.stickyNotes = [];
      io.to(roomId).emit('clear-board');
      await persistRoom(roomId, roomState, socket.data.userId, socket.data.username);
    });

    socket.on('shape-add', () => {
      authorizedRoom(socket);
    });

    socket.on('shape-update', () => {
      authorizedRoom(socket);
    });

    socket.on('shape-delete', () => {
      authorizedRoom(socket);
    });

    socket.on('sticky-note-add', (data) => {
      const roomId = authorizedRoom(socket);
      if (!roomId) return;
      const note = validateStickyNote(data);
      if (!note) {
        socket.emit('action-error', { error: 'Invalid sticky note' });
        return;
      }
      const roomState = rooms.get(roomId);
      if (!roomState) return;
      if (roomState.stickyNotes.some((existing) => existing.id === note.id)) return;
      if (roomState.stickyNotes.length >= MAX_STICKY_NOTES) {
        socket.emit('action-error', { error: 'This board has reached the sticky note limit' });
        return;
      }
      note.userId = socket.data.userId;
      note.username = socket.data.username;
      roomState.stickyNotes.push(note);
      socket.to(roomId).emit('sticky-note-add', note);
    });

    socket.on('sticky-note-update', (data) => {
      const roomId = authorizedRoom(socket);
      if (!roomId) return;
      const patch = validateStickyPatch(data);
      if (!patch) return;
      const roomState = rooms.get(roomId);
      if (!roomState) return;
      const idx = roomState.stickyNotes.findIndex((note) => note.id === patch.id);
      if (idx === -1) return;
      roomState.stickyNotes[idx] = { ...plainBoardValue(roomState.stickyNotes[idx]), ...patch };
      socket.to(roomId).emit('sticky-note-update', patch);
    });

    socket.on('sticky-note-delete', (data) => {
      const roomId = authorizedRoom(socket);
      if (!roomId) return;
      const id = data && typeof data === 'object' ? data.id : null;
      const patch = validateStickyPatch({ id });
      if (!patch) return;
      const roomState = rooms.get(roomId);
      if (!roomState) return;
      roomState.stickyNotes = roomState.stickyNotes.filter((note) => note.id !== patch.id);
      socket.to(roomId).emit('sticky-note-delete', { id: patch.id });
    });

    socket.on('save-board', async () => {
      const roomId = await requireMember(socket);
      if (!roomId) return;
      const roomState = rooms.get(roomId);
      if (!roomState) return;
      await persistRoom(roomId, roomState, socket.data.userId, socket.data.username);
    });

    socket.on('disconnect', async () => {
      const roomId = socket.data.roomId;
      if (roomId) {
        const roomState = rooms.get(roomId);
        if (roomState) {
          roomState.users.delete(socket.id);
          if (roomState.users.size === 0) {
            await persistRoom(roomId, roomState, socket.data.userId, socket.data.username);
            if (roomState.users.size === 0 && rooms.get(roomId) === roomState) {
              rooms.delete(roomId);
            }
          } else {
            io.to(roomId).emit('user-left', socket.id);
            io.to(roomId).emit('room-users', Array.from(roomState.users.values()));
          }
        }
        socket.to(roomId).emit('cursor-remove', socket.id);
      }
    });
  });
};

module.exports = setupWhiteboardSocket;
