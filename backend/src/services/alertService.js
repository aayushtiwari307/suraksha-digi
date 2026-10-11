const mongoose = require('mongoose');
const Alert = require('../models/Alert');
const Elder = require('../models/Elder');

const SEVERITY_SCORE_DELTA = { high: 20, medium: 10, low: 5 };

// Creates an alert and applies the corresponding safety-score change as one
// MongoDB transaction. When sourceType/sourceId identify an event (for
// example a MedicationLog), the pair is treated as an idempotency key:
// reprocessing the same source returns the existing alert instead of making
// another alert or changing the score twice.
const createAlertWithScoreUpdate = async (
  elder,
  { elderId, type, severity, message, messageHindi, sourceType, sourceId }
) => {
  const resolvedSeverity = severity || 'medium';
  const delta = SEVERITY_SCORE_DELTA[resolvedSeverity] ?? SEVERITY_SCORE_DELTA.low;

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      let alert = null;

      if (sourceType && sourceId) {
        alert = await Alert.findOne({ sourceType, sourceId }).session(session);

        if (alert) {
          // Existing alerts are already the source of truth for this event.
          // No duplicate alert or second score deduction.
          result = {
            alert,
            updatedSafetyScore: (await Elder.findById(elder._id).session(session)).safetyScore,
          };
          return;
        }
      }

      alert = (await Alert.create([{
        elderId,
        type,
        severity: resolvedSeverity,
        message,
        messageHindi,
        sourceType,
        sourceId,
        scoreApplied: false,
      }], { session }))[0];

      const elderInTransaction = await Elder.findById(elder._id).session(session);
      if (!elderInTransaction) {
        throw new Error(`Elder ${elder._id} not found while creating alert`);
      }

      elderInTransaction.safetyScore = Math.max(0, elderInTransaction.safetyScore - delta);
      await elderInTransaction.save({ session });

      alert.scoreApplied = true;
      await alert.save({ session });

      result = {
        alert,
        updatedSafetyScore: elderInTransaction.safetyScore,
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
};

module.exports = { createAlertWithScoreUpdate, SEVERITY_SCORE_DELTA };
