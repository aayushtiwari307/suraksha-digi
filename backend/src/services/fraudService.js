const crypto = require('crypto');
const Transaction = require('../models/Transaction');
const Alert = require('../models/Alert');
const Elder = require('../models/Elder');
const { createAlertWithScoreUpdate } = require('./alertService');
const { calculateFraudSignals } = require('../utils/fraudSignals');
const { normalizeRecipient } = require('../utils/smsParser');
const { generateFraudExplanation, generateSafetyMessage } = require('../config/gemini');

const fallbackExplanation = ({ riskLevel, signals, amount, recipient }) => {
  const reasons = [];
  if (signals.newRecipient) reasons.push('the recipient is new for this elder');
  if (signals.unusualAmount) reasons.push('the amount is unusually high compared with the elder’s previous transactions');
  if (signals.unusualTime) reasons.push('the transaction happened at an unusual time');
  if (signals.highVelocity) reasons.push('multiple transactions were detected within a short period');
  if (signals.scamKeyword) reasons.push(`the message contains scam-related wording (${signals.matchedKeywords.join(', ')})`);

  if (reasons.length === 0) {
    return `This ${riskLevel}-risk transaction of ₹${amount.toLocaleString('en-IN')} to ${recipient} did not trigger strong fraud warning signs.`;
  }

  return `This transaction is ${riskLevel} risk because ${reasons.join(', ')}.`;
};

const buildFingerprint = ({ elderId, rawMessage, amount, recipient, transactionType, transactionTime, reference }) => {
  const normalizedMessage = rawMessage.toLowerCase().replace(/\s+/g, ' ').trim();
  const normalizedRecipient = normalizeRecipient(recipient).toLowerCase();
  const key = reference
    ? `${elderId}|reference:${reference.toLowerCase().trim()}`
    : `${elderId}|${normalizedMessage}|${amount}|${normalizedRecipient}|${transactionType}`;

  return crypto.createHash('sha256').update(key).digest('hex');
};

const loadHistory = async (elderId, excludeFingerprint) => {
  return Transaction.find({ elderId, fingerprint: { $ne: excludeFingerprint } })
    .select('amount recipient transactionType transactionTime riskLevel')
    .sort({ transactionTime: -1 })
    .limit(100)
    .lean();
};

const HIGH_RISK_ALERT_MESSAGE_HINDI =
  'यह लेन-देन संदिग्ध लग रहा है। कृपया इस भुगतान की पुष्टि किए बिना आगे कोई कार्रवाई न करें।';

// Every place that returns an already-existing transaction (device-event
// dedup, fingerprint dedup, and the E11000 race recovery path below) needs
// the same guarantee: a HIGH-risk transaction must always have a matching
// alert, even if the alert failed to get created the first time around
// (e.g. a crash or a transient error between the two writes). Centralising
// the lookup+repair here means all three call sites behave the same way —
// previously only the fingerprint path repaired a missing alert, so a
// retried Android SMS event (which is looked up by deviceId+eventId) could
// come back "duplicate: true" with alert: null forever.
const ensureAlertForExisting = async (elder, existingTransaction) => {
  const existingAlert = await Alert.findOne({
    sourceType: 'transaction',
    sourceId: existingTransaction._id,
  }).select('_id severity isResolved message messageHindi');

  if (existingAlert || existingTransaction.riskLevel !== 'high') {
    return existingAlert;
  }

  const alertResult = await createAlertWithScoreUpdate(elder, {
    elderId: existingTransaction.elderId,
    type: 'fraud',
    severity: 'high',
    message: existingTransaction.aiReason || 'This transaction is high risk.',
    messageHindi: HIGH_RISK_ALERT_MESSAGE_HINDI,
    sourceType: 'transaction',
    sourceId: existingTransaction._id,
  });

  return alertResult.alert;
};

const findDuplicateTransaction = async ({ deviceId, eventId, fingerprint }) => {
  if (deviceId && eventId) {
    const byEvent = await Transaction.findOne({ deviceId, eventId });
    if (byEvent) return byEvent;
  }
  return Transaction.findOne({ fingerprint });
};

// The single shared answer to "has this exact Android event already been
// processed, and if so is its HIGH-risk alert still intact?". Exported so
// the SMS-ingestion path can short-circuit an exact retry without re-parsing
// the message, *without* growing its own second copy of this logic — that
// duplication is precisely what let a missing-alert bug survive a previous
// round of fixes. Returns null when this isn't a known duplicate.
const resolveExistingDeviceEvent = async ({ deviceId, eventId, elder = null }) => {
  if (!deviceId || !eventId) return null;

  const existingEvent = await Transaction.findOne({ deviceId, eventId });
  if (!existingEvent) return null;

  // Callers that already hold the elder (processTransaction) pass it in;
  // the SMS fast path doesn't have one yet, so look it up here.
  const owner = elder || await Elder.findById(existingEvent.elderId);
  const alert = await ensureAlertForExisting(owner, existingEvent);

  return { transaction: existingEvent, alert, duplicate: true };
};

const processTransaction = async ({
  elderId,
  rawMessage,
  amount,
  recipient,
  transactionType,
  transactionTime,
  reference,
  source = 'simulation',
  deviceId = null,
  eventId = null,
  sender = '',
}) => {
  const elder = await Elder.findById(elderId);
  if (!elder) {
    const error = new Error('Elder not found');
    error.statusCode = 404;
    throw error;
  }

  if (elder.isActive === false) {
    const error = new Error('This elder account is inactive');
    error.statusCode = 400;
    throw error;
  }

  const existingDeviceEvent = await resolveExistingDeviceEvent({ deviceId, eventId, elder });
  if (existingDeviceEvent) return existingDeviceEvent;

  const fingerprint = buildFingerprint({
    elderId,
    rawMessage,
    amount,
    recipient,
    transactionType,
    transactionTime,
    reference,
  });

  const existing = await Transaction.findOne({ fingerprint });
  if (existing) {
    const alert = await ensureAlertForExisting(elder, existing);
    return { transaction: existing, alert, duplicate: true };
  }

  const history = await loadHistory(elderId, fingerprint);
  const assessment = calculateFraudSignals({
    amount,
    recipient,
    rawMessage,
    transactionType,
    transactionTime,
    history,
  });

  let aiReason = fallbackExplanation({
    riskLevel: assessment.riskLevel,
    signals: assessment.signals,
    amount,
    recipient,
  });

  const aiExplanation = await generateFraudExplanation({
    riskLevel: assessment.riskLevel,
    riskScore: assessment.riskScore,
    amount,
    recipient,
    transactionType,
    transactionTime: transactionTime.toISOString(),
    signals: assessment.signals,
  });

  if (aiExplanation) {
    aiReason = aiExplanation.trim();
  }

  // Only include deviceId/eventId when this is a real device-originated
  // event. Explicitly passing `deviceId: null, eventId: null` would still
  // set those keys on the document (Mongoose only falls back to a default
  // for `undefined`, not `null`), which is exactly what previously made
  // every simulation transaction collide on the same (null, null) partial
  // index entry.
  const deviceFields = deviceId && eventId ? { deviceId, eventId } : {};

  let transaction;
  try {
    transaction = await Transaction.create({
      elderId,
      rawMessage,
      amount,
      recipient,
      transactionType,
      transactionTime,
      signals: assessment.signals,
      riskScore: assessment.riskScore,
      riskLevel: assessment.riskLevel,
      aiReason,
      fingerprint,
      source,
      sender,
      ...deviceFields,
    });
  } catch (error) {
    // A concurrent request for the exact same fingerprint or the exact same
    // deviceId+eventId can win the race between our findOne() checks above
    // and this create(). Rather than surfacing a raw 500 (which, for the
    // Android SMS path, just triggers another retry of the same request),
    // resolve it the same way we resolve any other duplicate.
    if (error?.code === 11000) {
      const winner = await findDuplicateTransaction({ deviceId, eventId, fingerprint });
      if (winner) {
        const alert = await ensureAlertForExisting(elder, winner);
        return { transaction: winner, alert, duplicate: true };
      }
    }
    throw error;
  }

  let alert = null;

  if (assessment.riskLevel === 'high') {
    const hindiFallback = `यह लेन-देन संदिग्ध लग रहा है। कृपया इस भुगतान की पुष्टि किए बिना आगे कोई कार्रवाई न करें।`;
    let messageHindi = hindiFallback;

    const generatedHindi = await generateSafetyMessage(
      'suspicious transaction',
      `Amount: ₹${amount.toLocaleString('en-IN')}; Recipient: ${recipient}; Risk score: ${assessment.riskScore}; Signals: ${assessment.signals.reasonCodes.join(', ')}`,
      'hindi'
    );

    if (generatedHindi) messageHindi = generatedHindi.trim();

    const alertResult = await createAlertWithScoreUpdate(elder, {
      elderId,
      type: 'fraud',
      severity: 'high',
      message: aiReason,
      messageHindi,
      sourceType: 'transaction',
      sourceId: transaction._id,
    });

    alert = alertResult.alert;
  }

  return { transaction, alert, duplicate: false };
};

module.exports = {
  processTransaction,
  resolveExistingDeviceEvent,
  buildFingerprint,
  fallbackExplanation,
};
