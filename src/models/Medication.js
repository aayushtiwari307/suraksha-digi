// src/models/Medication.js

const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema(
  {
    elderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Elder',
      required: true,
    },
    medicineName: {
      type: String,
      required: true,
      trim: true,
    },
    dosage: {
      type: String,
      required: true,
      trim: true, // e.g. "500mg", "1 tablet"
    },
    scheduledTime: {
      type: String,
      required: true, // e.g. "09:00", "21:00" — 24hr format
    },
    frequency: {
      type: String,
      enum: ['daily'],
      default: 'daily',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Family',
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Medication', medicationSchema);