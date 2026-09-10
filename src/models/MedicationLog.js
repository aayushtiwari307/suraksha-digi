// src/models/MedicationLog.js

const mongoose = require('mongoose');

const medicationLogSchema = new mongoose.Schema(
  {
    medicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medication',
      required: true,
    },
    elderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Elder',
      required: true,
    },
    date: {
      type: String,
      required: true, // e.g. "2026-07-31" — YYYY-MM-DD format
    },
    status: {
      type: String,
      enum: ['pending', 'taken', 'missed'],
      default: 'pending',
    },
    // True once the medication_missed alert for this log has actually
    // been created. Separate from `status` deliberately: `status`
    // flipping to 'missed' is what prevents duplicate detection, but if
    // Alert.create() then fails, status is already 'missed' and would
    // never be revisited — this flag lets the scheduler retry alert
    // creation on a later tick for a log that's missed but not yet
    // alerted, without re-running (or duplicating) detection.
    alertCreated: {
      type: Boolean,
      default: false,
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'markedByRole', // dynamic ref based on who marked it
    },
    markedByRole: {
      type: String,
      enum: ['Family', 'Elder'], // must match your exact model names
    },
    takenAt: {
      type: Date, // exact timestamp when marked taken
    },
  },
  { timestamps: true }
);

// One log per medication per IST calendar date. This protects against
// races between dashboard bookkeeping and the background scheduler.
medicationLogSchema.index(
  { medicationId: 1, date: 1 },
  { unique: true }
);

module.exports = mongoose.model('MedicationLog', medicationLogSchema);
