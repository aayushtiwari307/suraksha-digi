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
      'suspicious_link',
      'medication_missed'
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
  reviewOutcome: {
    type: String,
    enum: ['unreviewed', 'confirmed_fraud', 'false_positive'],
    default: 'unreviewed'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Family'
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  // What caused this alert — lets the dashboard link an alert back to
  // its underlying event (e.g. which MedicationLog, later which
  // Transaction). Optional/non-breaking: existing alert-creation call
  // sites that don't pass these still work unchanged.
  sourceType: {
    type: String,
    enum: ['medication', 'transaction']
  },
  sourceId: {
    type: mongoose.Schema.Types.ObjectId
  },
  // True only after the alert has been created and the corresponding
  // safety-score update has completed in the same transaction.
  scoreApplied: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// One automated alert per underlying event. Manual alerts without source
// fields are excluded from this unique sparse index.
alertSchema.index({ sourceType: 1, sourceId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Alert', alertSchema);
