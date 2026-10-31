require('dotenv').config();
const connectDB = require('./config/db');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { parseAllowedOrigins } = require('./utils/validate');

const authRoutes = require('./routes/auth');
const boardRoutes = require('./routes/boards');
const setupWhiteboardSocket = require('./sockets/whiteboard');

const app = express();
const server = http.createServer(app);
const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  maxHttpBufferSize: 1e6
});

app.set('trust proxy', 1);
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

app.use(express.static('../client'));
app.use('/api/auth', authRoutes);
app.use('/api/boards', boardRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

setupWhiteboardSocket(io);

const PORT = process.env.PORT || 5000;
if (require.main === module) {
  connectDB();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = { app, server, io };
