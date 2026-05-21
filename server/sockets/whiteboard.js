const Board = require('../models/Board');
const BoardHistory = require('../models/BoardHistory');

const rooms = new Map();

const setupWhiteboardSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join-room', async ({ roomId, username, userId, color }) => {
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.username = username;
      socket.data.userId = userId;

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Map());
      }

      const roomUsers = rooms.get(roomId);
      roomUsers.set(socket.id, {
        id: socket.id,
        username: username || 'Anonymous',
        userId: userId || socket.id,
        color: color || '#666',
        lastActive: Date.now()
      });

      const board = await Board.findOne({ roomId });
      const strokes = board?.strokes || [];
      const stickyNotes = board?.stickyNotes || [];

      socket.emit('board-state', { strokes, stickyNotes, users: Array.from(roomUsers.values()) });

      socket.to(roomId).emit('user-joined', {
        id: socket.id,
        username: username || 'Anonymous',
        color: color || '#666'
      });

      io.to(roomId).emit('room-users', Array.from(roomUsers.values()));
    });

    socket.on('draw', (data) => {
      const { roomId } = socket.data;
      if (roomId) {
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

    socket.on('undo', (data) => {
      const { roomId } = socket.data;
      if (roomId) {
        socket.to(roomId).emit('undo', data);
      }
    });

    socket.on('redo', (data) => {
      const { roomId } = socket.data;
      if (roomId) {
        socket.to(roomId).emit('redo', data);
      }
    });

    socket.on('clear-board', () => {
      const { roomId } = socket.data;
      if (roomId) {
        socket.to(roomId).emit('clear-board');
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
        socket.to(roomId).emit('sticky-note-add', data);
      }
    });

    socket.on('sticky-note-update', (data) => {
      const { roomId } = socket.data;
      if (roomId) {
        socket.to(roomId).emit('sticky-note-update', data);
      }
    });

    socket.on('sticky-note-delete', (data) => {
      const { roomId } = socket.data;
      if (roomId) {
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
        const roomUsers = rooms.get(roomId);
        if (roomUsers) {
          roomUsers.delete(socket.id);
          if (roomUsers.size === 0) {
            rooms.delete(roomId);
          } else {
            io.to(roomId).emit('user-left', socket.id);
            io.to(roomId).emit('room-users', Array.from(roomUsers.values()));
          }
        }
        socket.to(roomId).emit('cursor-remove', socket.id);
      }
      console.log(`User disconnected: ${socket.id}`);
    });
  });
};

module.exports = setupWhiteboardSocket;
