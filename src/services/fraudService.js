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

const processTransaction = async ({
  elderId,
  rawMessage,
  amount,
  recipient,
  transactionType,
  transactionTime,
  reference,
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
    const existingAlert = await Alert.findOne({
      sourceType: 'transaction',
      sourceId: existing._id,
    }).select('_id severity isResolved message messageHindi');

    let alert = existingAlert;
    if (existing.riskLevel === 'high' && !existingAlert) {
      const messageHindi = 'यह लेन-देन संदिग्ध लग रहा है। कृपया इस भुगतान की पुष्टि किए बिना आगे कोई कार्रवाई न करें।';
      const alertResult = await createAlertWithScoreUpdate(elder, {
        elderId,
        type: 'fraud',
        severity: 'high',
        message: existing.aiReason || `This transaction is high risk.`,
        messageHindi,
        sourceType: 'transaction',
        sourceId: existing._id,
      });
      alert = alertResult.alert;
    }

    return {
      transaction: existing,
      alert,
      duplicate: true,
    };
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

  const transaction = await Transaction.create({
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
  });

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
  buildFingerprint,
  fallbackExplanation,
};
