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
    // Duration window, IST calendar dates ("YYYY-MM-DD"). endDate null
    // means indefinite ("until stopped"). Pre-existing medications from
    // before this field existed have no startDate — utils/istTime.js's
    // isDateInRange() treats that as always-active rather than
    // excluding them, so old demo data doesn't silently disappear.
    startDate: {
      type: String,
    },
    endDate: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Medication', medicationSchema);