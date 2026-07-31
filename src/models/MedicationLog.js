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

module.exports = mongoose.model('MedicationLog', medicationLogSchema);