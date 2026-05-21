const mongoose = require('mongoose');

const pointSchema = new mongoose.Schema({
  x: { type: Number, required: true },
  y: { type: Number, required: true }
}, { _id: false });

const strokeSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['pencil', 'rectangle', 'circle', 'eraser'],
    required: true
  },
  points: [pointSchema],
  x: Number,
  y: Number,
  width: Number,
  height: Number,
  color: { type: String, required: true },
  strokeWidth: { type: Number, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username: String,
  timestamp: { type: Number, required: true }
}, { _id: true });

const stickyNoteSchema = new mongoose.Schema({
  id: { type: String, required: true },
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  text: { type: String, default: 'Type here...' },
  color: { type: String, default: '#fff9c4' },
  width: { type: Number, default: 200 },
  height: { type: Number, default: 200 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username: String,
  zIndex: { type: Number, default: 0 }
}, { _id: false });

const layerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  visible: { type: Boolean, default: true },
  locked: { type: Boolean, default: false },
  zIndex: { type: Number, required: true }
}, { _id: true });

const boardSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    default: 'Untitled Board'
  },
  strokes: [strokeSchema],
  stickyNotes: [stickyNoteSchema],
  layers: [layerSchema],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  collaborators: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isPublic: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

boardSchema.methods.addStroke = function(stroke) {
  this.strokes.push(stroke);
  return this.save();
};

boardSchema.methods.removeStroke = function(strokeId) {
  this.strokes = this.strokes.filter(s => s._id.toString() !== strokeId);
  return this.save();
};

module.exports = mongoose.model('Board', boardSchema);
