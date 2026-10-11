const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema(
  {
    // Android-generated stable installation ID. Assigned when pairing.
    // Omitted while a family-created pairing request is waiting.
    deviceId: {
      type: String,
      trim: true,
      maxlength: 128,
    },
    elderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Elder',
      required: true,
      index: true,
    },
    // SHA-256 of the scoped device JWT. Raw tokens never live in MongoDB.
    // Omitted when the device is unpaired so the sparse unique index works.
    tokenHash: {
      type: String,
      index: true,
    },
    pairedAt: {
      type: Date,
    },
    lastSeenAt: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: false,
      index: true,
    },
    pairingCodeHash: {
      type: String,
      index: true,
    },
    pairingCodeExpiresAt: {
      type: Date,
      index: true,
    },
  },
  { timestamps: true }
);

// One Android installation ID can be authorized for only one Device record
// at a time. Pending pairings omit deviceId and are therefore excluded.
deviceSchema.index({ deviceId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Device', deviceSchema);
