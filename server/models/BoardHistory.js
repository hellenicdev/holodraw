const mongoose = require('mongoose');

const boardHistorySchema = new mongoose.Schema({
  boardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    required: true,
    index: true
  },
  action: {
    type: String,
    enum: ['stroke_added', 'stroke_removed', 'cleared', 'sticky_note_added',
           'sticky_note_updated', 'sticky_note_removed', 'board_loaded'],
    required: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  username: String,
  timestamp: { type: Number, required: true }
}, { timestamps: true });

boardHistorySchema.index({ boardId: 1, timestamp: -1 });

module.exports = mongoose.model('BoardHistory', boardHistorySchema);
