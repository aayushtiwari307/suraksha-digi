const {
  generateSafetyMessage,
  generateFraudExplanation,
  generateHindiGuidance
} = require('../config/gemini');
const { validateTransactionAnalysis } = require('../utils/validators');
const Elder = require('../models/Elder');
const Transaction = require('../models/Transaction');
const { calculateFraudSignals } = require('../utils/fraudSignals');
const { buildFingerprint, fallbackExplanation } = require('../services/fraudService');

// Legacy structured transaction endpoint kept for backward compatibility.
// Phase 2's canonical fraud flow is /api/transactions/ingest-sms.
// This endpoint no longer asks Gemini to make the fraud decision.
const analyzeTransaction = async (req, res) => {
  try {
    const inputValidation = validateTransactionAnalysis(req.body);
    if (!inputValidation.valid) {
      return res.status(400).json({ success: false, message: inputValidation.message });
    }

    const { elderId, amount, recipient, time, description } = req.body;
    const elder = await Elder.findById(elderId);
    if (!elder) return res.status(404).json({ success: false, message: 'Elder not found' });

    const transactionTime = (() => {
      const parsed = new Date(time);
      return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    })();

    const fingerprint = buildFingerprint({
      elderId,
      rawMessage: description,
      amount,
      recipient,
      transactionType: 'unknown',
      transactionTime,
      reference: null,
    });

    const history = await Transaction.find({ elderId, fingerprint: { $ne: fingerprint } })
      .select('amount recipient transactionTime')
      .sort({ transactionTime: -1 })
      .limit(100)
      .lean();

    const assessment = calculateFraudSignals({
      amount,
      recipient,
      rawMessage: description,
      transactionTime,
      history,
    });

    const aiReason = await generateFraudExplanation({
      riskLevel: assessment.riskLevel,
      riskScore: assessment.riskScore,
      amount,
      recipient,
      transactionType: 'unknown',
      transactionTime: transactionTime.toISOString(),
      signals: assessment.signals,
    });

    res.status(200).json({
      success: true,
      analysis: {
        riskLevel: assessment.riskLevel,
        riskScore: assessment.riskScore,
        signals: assessment.signals,
        reason: aiReason || fallbackExplanation({
          riskLevel: assessment.riskLevel,
          signals: assessment.signals,
          amount,
          recipient,
        }),
      },
      alertCreated: false,
      updatedSafetyScore: elder.safetyScore,
      message: 'Legacy analysis endpoint. Use SMS ingestion for the full transaction workflow.'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getHindiGuidance = async (req, res) => {
  try {
    const { task } = req.body;
    const guidance = await generateHindiGuidance(task);
    if (!guidance) return res.status(500).json({ success: false, message: 'AI guidance generation failed' });
    res.status(200).json({ success: true, task, guidance });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getSafetyMessage = async (req, res) => {
  try {
    const { alertType, details, language } = req.body;
    const message = await generateSafetyMessage(alertType, details, language || 'hindi');
    if (!message) return res.status(500).json({ success: false, message: 'AI message generation failed' });
    res.status(200).json({ success: true, message });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  analyzeTransaction,
  getHindiGuidance,
  getSafetyMessage
};
