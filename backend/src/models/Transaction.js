const mongoose = require('mongoose');

const fraudSignalsSchema = new mongoose.Schema(
  {
    newRecipient: { type: Boolean, default: false },
    unusualAmount: { type: Boolean, default: false },
    unusualTime: { type: Boolean, default: false },
    highVelocity: { type: Boolean, default: false },
    scamKeyword: { type: Boolean, default: false },
    amountDeviationRatio: { type: Number, default: 0 },
    historicalAverageAmount: { type: Number, default: 0 },
    recentTransactionCount: { type: Number, default: 0 },
    transactionCount: { type: Number, default: 0 },
    confidenceTier: {
      type: String,
      enum: ['low', 'partial', 'full'],
      default: 'low'
    },
    matchedKeywords: { type: [String], default: [] },
    reasonCodes: { type: [String], default: [] },
  },
  { _id: false }
);

const transactionSchema = new mongoose.Schema(
  {
    elderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Elder',
      required: true,
      index: true,
    },
    rawMessage: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    recipient: {
      type: String,
      trim: true,
      maxlength: 200,
      default: 'Unknown recipient',
    },
    transactionType: {
      type: String,
      enum: ['debit', 'credit', 'transfer', 'unknown'],
      default: 'unknown',
    },
    transactionTime: {
      type: Date,
      required: true,
      index: true,
    },
    signals: {
      type: fraudSignalsSchema,
      default: () => ({}),
    },
    riskScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high'],
      required: true,
      index: true,
    },
    aiReason: {
      type: String,
      maxlength: 1500,
      default: '',
    },
    fingerprint: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    source: {
      type: String,
      enum: ['simulation', 'android_sms'],
      default: 'simulation',
      index: true,
    },
    // No `default: null` here on purpose. Mongoose applies a schema default
    // whenever a path is `undefined`, which would make every simulation
    // transaction (no real device) explicitly store deviceId: null,
    // eventId: null. A *compound* sparse index (see below) indexes a
    // document as soon as at least one of its fields is present — even
    // with a null value — so every such document would collide on the
    // same (null, null) index entry and every simulation transaction after
    // the first would fail to insert with E11000. Leaving these fields
    // genuinely absent for simulation transactions keeps them out of the
    // index entirely.
    deviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Device',
      index: true,
    },
    eventId: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    sender: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
  },
  { timestamps: true }
);

transactionSchema.index({ elderId: 1, transactionTime: -1 });
transactionSchema.index({ elderId: 1, recipient: 1, transactionTime: -1 });
// Uniqueness is intentionally scoped to Android-originated events only.
// Simulation transactions never carry deviceId/eventId and are never
// subject to this constraint — the fingerprint field (above) is what
// de-duplicates those.
transactionSchema.index(
  { deviceId: 1, eventId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      deviceId: { $exists: true },
      eventId: { $exists: true },
    },
  }
);

module.exports = mongoose.model('Transaction', transactionSchema);
