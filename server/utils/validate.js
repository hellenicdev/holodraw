const crypto = require('crypto');

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const ROOM_ID = /^[a-f0-9]{32}$/;
const OBJECT_ID = /^[a-f0-9]{24}$/i;
const STICKY_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const EMAIL = /^\S+@\S+\.\S+$/;
const ERASER_COLOR = 'rgba(0,0,0,0)';
const STROKE_TYPES = new Set(['pencil', 'rectangle', 'circle', 'eraser']);

const MAX_STROKES = 2000;
const MAX_POINTS = 1000;
const MAX_STICKY_NOTES = 200;
const MAX_NOTE_TEXT = 2000;
const MAX_COORD = 1e6;
const MAX_STROKE_WIDTH = 80;

function isHexColor(value) {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

function randomHexColor() {
  return `#${crypto.randomBytes(3).toString('hex')}`;
}

function parseAllowedOrigins(value) {
  const raw = typeof value === 'string' && value.trim() ? value : 'https://hellenicdev.eu';
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
}

function normalizeRoomId(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim().toLowerCase();
  return ROOM_ID.test(id) ? id : null;
}

function generateRoomId() {
  return crypto.randomBytes(16).toString('hex');
}

function isFiniteCoord(value) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORD;
}

function sanitizeName(value) {
  if (typeof value !== 'string') return 'Anonymous';
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 30);
  return cleaned || 'Anonymous';
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 320 || !EMAIL.test(email)) return null;
  return email;
}

function isBoardMember(board, userId) {
  if (!board || userId == null) return false;
  const id = userId.toString();
  if (board.createdBy && board.createdBy.toString() === id) return true;
  return Array.isArray(board.collaborators)
    && board.collaborators.some((collaborator) => collaborator && collaborator.toString() === id);
}

function validateStroke(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (!STROKE_TYPES.has(data.type)) return null;
  if (typeof data.strokeWidth !== 'number' || !Number.isFinite(data.strokeWidth)) return null;
  if (data.strokeWidth < 0.5 || data.strokeWidth > MAX_STROKE_WIDTH) return null;

  const timestamp = typeof data.timestamp === 'number' && Number.isFinite(data.timestamp)
    ? data.timestamp
    : Date.now();

  const stroke = {
    type: data.type,
    strokeWidth: data.strokeWidth,
    timestamp
  };

  if (data.type === 'eraser') {
    stroke.color = ERASER_COLOR;
  } else if (isHexColor(data.color)) {
    stroke.color = data.color;
  } else {
    return null;
  }

  if (data.type === 'pencil' || data.type === 'eraser') {
    if (!Array.isArray(data.points) || data.points.length < 2 || data.points.length > MAX_POINTS) return null;
    const points = [];
    for (const point of data.points) {
      if (!point || typeof point !== 'object' || Array.isArray(point)) return null;
      if (!isFiniteCoord(point.x) || !isFiniteCoord(point.y)) return null;
      points.push({ x: point.x, y: point.y });
    }
    stroke.points = points;
  } else if (!isFiniteCoord(data.x) || !isFiniteCoord(data.y) || !isFiniteCoord(data.width) || !isFiniteCoord(data.height)) {
    return null;
  } else {
    stroke.x = data.x;
    stroke.y = data.y;
    stroke.width = data.width;
    stroke.height = data.height;
  }

  if (typeof data.userId === 'string' && OBJECT_ID.test(data.userId)) {
    stroke.userId = data.userId;
  }
  if (typeof data.username === 'string') {
    stroke.username = sanitizeName(data.username);
  }

  return stroke;
}

function validateStrokeList(strokes) {
  if (!Array.isArray(strokes) || strokes.length > MAX_STROKES) return null;
  const clean = [];
  for (const stroke of strokes) {
    const valid = validateStroke(stroke);
    if (!valid) return null;
    clean.push(valid);
  }
  return clean;
}

function validateStickyNote(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (typeof data.id !== 'string' || !STICKY_ID.test(data.id)) return null;
  if (!isFiniteCoord(data.x) || !isFiniteCoord(data.y)) return null;

  const width = data.width == null ? 160 : data.width;
  const height = data.height == null ? 160 : data.height;
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0 || width > 2000 || height > 2000) return null;
  if (data.text != null && typeof data.text !== 'string') return null;
  if (typeof data.text === 'string' && data.text.length > MAX_NOTE_TEXT) return null;
  if (data.color != null && !isHexColor(data.color)) return null;

  const note = {
    id: data.id,
    x: data.x,
    y: data.y,
    width,
    height,
    text: typeof data.text === 'string' ? data.text : '',
    color: isHexColor(data.color) ? data.color : '#fff9c4'
  };

  if (typeof data.zIndex === 'number' && Number.isFinite(data.zIndex) && data.zIndex >= 0 && data.zIndex <= 10000) {
    note.zIndex = data.zIndex;
  }

  return note;
}

function validateStickyPatch(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (typeof data.id !== 'string' || !STICKY_ID.test(data.id)) return null;

  const patch = { id: data.id };
  if (data.x !== undefined || data.y !== undefined) {
    if (!isFiniteCoord(data.x) || !isFiniteCoord(data.y)) return null;
    patch.x = data.x;
    patch.y = data.y;
  }
  if (data.text !== undefined) {
    if (typeof data.text !== 'string' || data.text.length > MAX_NOTE_TEXT) return null;
    patch.text = data.text;
  }
  if (data.color !== undefined) {
    if (!isHexColor(data.color)) return null;
    patch.color = data.color;
  }
  if (data.width !== undefined || data.height !== undefined) {
    if (typeof data.width !== 'number' || typeof data.height !== 'number') return null;
    if (!Number.isFinite(data.width) || !Number.isFinite(data.height)) return null;
    if (data.width <= 0 || data.height <= 0 || data.width > 2000 || data.height > 2000) return null;
    patch.width = data.width;
    patch.height = data.height;
  }
  if (data.zIndex !== undefined) {
    if (typeof data.zIndex !== 'number' || !Number.isFinite(data.zIndex) || data.zIndex < 0 || data.zIndex > 10000) return null;
    patch.zIndex = data.zIndex;
  }
  return patch;
}

function validateStickyList(notes) {
  if (!Array.isArray(notes) || notes.length > MAX_STICKY_NOTES) return null;
  const clean = [];
  for (const note of notes) {
    const valid = validateStickyNote(note);
    if (!valid) return null;
    clean.push(valid);
  }
  return clean;
}

module.exports = {
  HEX_COLOR,
  ERASER_COLOR,
  MAX_STROKES,
  MAX_POINTS,
  MAX_STICKY_NOTES,
  MAX_NOTE_TEXT,
  isHexColor,
  randomHexColor,
  parseAllowedOrigins,
  normalizeRoomId,
  generateRoomId,
  isFiniteCoord,
  sanitizeName,
  normalizeEmail,
  isBoardMember,
  validateStroke,
  validateStrokeList,
  validateStickyNote,
  validateStickyPatch,
  validateStickyList
};
