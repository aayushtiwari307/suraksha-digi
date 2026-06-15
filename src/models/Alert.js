const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  elderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Elder',
    required: true
  },
  type: {
    type: String,
    enum: [
      'fraud',
      'confusion',
      'inactivity',
      'unusual_transaction',
      'suspicious_link'
    ],
    required: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  message: {
    type: String,
    required: true
  },
  messageHindi: {
    type: String
  },
  isResolved: {
    type: Boolean,
    default: false
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Family'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Alert', alertSchema);