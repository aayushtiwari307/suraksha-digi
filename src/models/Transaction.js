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
  },
  { timestamps: true }
);

transactionSchema.index({ elderId: 1, transactionTime: -1 });
transactionSchema.index({ elderId: 1, recipient: 1, transactionTime: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
