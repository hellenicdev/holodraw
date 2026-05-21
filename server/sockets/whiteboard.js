const Board = require('../models/Board');
const BoardHistory = require('../models/BoardHistory');

const rooms = new Map();

const getRoomState = (roomId) => {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { users: new Map(), strokes: [], stickyNotes: [] });
  }
  return rooms.get(roomId);
};

const setupWhiteboardSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join-room', async ({ roomId, username, userId, color }) => {
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.username = username;
      socket.data.userId = userId;

      const roomState = getRoomState(roomId);
      roomState.users.set(socket.id, {
        id: socket.id,
        username: username || 'Anonymous',
        userId: userId || socket.id,
        color: color || '#666',
        lastActive: Date.now()
      });

      if (roomState.strokes.length === 0) {
        const board = await Board.findOne({ roomId });
        if (board) {
          roomState.strokes = board.strokes || [];
          roomState.stickyNotes = board.stickyNotes || [];
        }
      }

      socket.emit('board-state', {
        strokes: roomState.strokes,
        stickyNotes: roomState.stickyNotes,
        users: Array.from(roomState.users.values())
      });

      socket.to(roomId).emit('user-joined', {
        id: socket.id,
        username: username || 'Anonymous',
        color: color || '#666'
      });

      io.to(roomId).emit('room-users', Array.from(roomState.users.values()));
    });

    socket.on('draw', (data) => {
      const { roomId } = socket.data;
      if (roomId) {
        const roomState = getRoomState(roomId);
        roomState.strokes.push({
          ...data,
          userId: socket.data.userId || socket.id,
          username: socket.data.username
        });
        socket.to(roomId).emit('draw', {
          ...data,
          userId: socket.data.userId || socket.id,
          username: socket.data.username
        });
      }
    });

    socket.on('cursor-move', (data) => {
      const { roomId } = socket.data;
      if (roomId) {
        socket.to(roomId).emit('cursor-move', {
          ...data,
          id: socket.id,
          username: socket.data.username,
          color: data.color
        });
      }
    });

    socket.on('undo', () => {
      const { roomId } = socket.data;
      if (roomId) {
        const roomState = getRoomState(roomId);
        const removed = roomState.strokes.pop();
        if (removed) socket.to(roomId).emit('undo');
      }
    });

    socket.on('redo', () => {
      const { roomId } = socket.data;
      if (roomId) {
        socket.to(roomId).emit('redo');
      }
    });

    socket.on('clear-board', () => {
      const { roomId } = socket.data;
      if (roomId) {
        const roomState = getRoomState(roomId);
        roomState.strokes = [];
        roomState.stickyNotes = [];
        io.to(roomId).emit('clear-board');
      }
    });

    socket.on('shape-add', (data) => {
      const { roomId } = socket.data;
      if (roomId) {
        socket.to(roomId).emit('shape-add', data);
      }
    });

    socket.on('shape-update', (data) => {
      const { roomId } = socket.data;
      if (roomId) {
        socket.to(roomId).emit('shape-update', data);
      }
    });

    socket.on('shape-delete', (data) => {
      const { roomId } = socket.data;
      if (roomId) {
        socket.to(roomId).emit('shape-delete', data);
      }
    });

    socket.on('sticky-note-add', (data) => {
      const { roomId } = socket.data;
      if (roomId) {
        const roomState = getRoomState(roomId);
        roomState.stickyNotes.push(data);
        socket.to(roomId).emit('sticky-note-add', data);
      }
    });

    socket.on('sticky-note-update', (data) => {
      const { roomId } = socket.data;
      if (roomId) {
        const roomState = getRoomState(roomId);
        const idx = roomState.stickyNotes.findIndex(n => n.id === data.id);
        if (idx !== -1) roomState.stickyNotes[idx] = { ...roomState.stickyNotes[idx], ...data };
        socket.to(roomId).emit('sticky-note-update', data);
      }
    });

    socket.on('sticky-note-delete', (data) => {
      const { roomId } = socket.data;
      if (roomId) {
        const roomState = getRoomState(roomId);
        roomState.stickyNotes = roomState.stickyNotes.filter(n => n.id !== data.id);
        socket.to(roomId).emit('sticky-note-delete', data);
      }
    });

    socket.on('save-board', async (data) => {
      const { roomId } = socket.data;
      if (!roomId) return;

      try {
        const board = await Board.findOne({ roomId });
        if (board) {
          if (data.strokes) board.strokes = data.strokes;
          if (data.stickyNotes) board.stickyNotes = data.stickyNotes;
          await board.save();
        }

        await BoardHistory.create({
          boardId: board?._id,
          action: data.action || 'board_saved',
          data: { strokeCount: data.strokes?.length, noteCount: data.stickyNotes?.length },
          userId: socket.data.userId,
          username: socket.data.username,
          timestamp: Date.now()
        });
      } catch (err) {
        console.error('Save board error:', err.message);
      }
    });

    socket.on('disconnect', () => {
      const { roomId } = socket.data;
      if (roomId) {
        const roomState = rooms.get(roomId);
        if (roomState) {
          roomState.users.delete(socket.id);
          if (roomState.users.size === 0) {
            rooms.delete(roomId);
          } else {
            io.to(roomId).emit('user-left', socket.id);
            io.to(roomId).emit('room-users', Array.from(roomState.users.values()));
          }
        }
        socket.to(roomId).emit('cursor-remove', socket.id);
      }
      console.log(`User disconnected: ${socket.id}`);
    });
  });
};

module.exports = setupWhiteboardSocket;
