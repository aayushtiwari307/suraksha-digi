const {
  generateSafetyMessage,
  analyzeFraudRisk,
  generateHindiGuidance
} = require('../config/gemini');
const { validateFraudAnalysis } = require('../utils/aiValidation');
const { validateTransactionAnalysis } = require('../utils/validators');
const Alert = require('../models/Alert');
const Elder = require('../models/Elder');

// ANALYZE TRANSACTION FOR FRAUD
const analyzeTransaction = async (req, res) => {
  try {
    const inputValidation = validateTransactionAnalysis(req.body);
    if (!inputValidation.valid) {
      return res.status(400).json({
        success: false,
        message: inputValidation.message
      });
    }

    const { elderId, amount, recipient, time, description } = req.body;

    // Find elder
    const elder = await Elder.findById(elderId);
    if (!elder) {
      return res.status(404).json({
        success: false,
        message: 'Elder not found'
      });
    }

    // Prepare transaction details for Gemini
    // NOTE: unusualAmount remains a hint included in the prompt only —
    // it is not (yet) an independent deterministic guardrail. See
    // Phase 4 notes: whether it should become one is a separate product
    // decision, not made here.
    const transactionDetails = {
      amount,
      recipient,
      time,
      description,
      elderAge: elder.age,
      unusualAmount: amount > 5000
    };

    // Ask Gemini to analyze. Gemini's raw output is untrusted model
    // output — it is validated below before anything derived from it
    // is persisted or returned.
    const rawAnalysis = await analyzeFraudRisk(transactionDetails);

    if (!rawAnalysis) {
      return res.status(500).json({
        success: false,
        message: 'AI analysis failed'
      });
    }

    const validation = validateFraudAnalysis(rawAnalysis);
    if (!validation.valid) {
      // Gemini responded, but not with a structure/riskLevel we trust.
      // Treated identically to "Gemini unavailable" — never silently
      // downgraded to low or escalated to high.
      return res.status(500).json({
        success: false,
        message: 'AI analysis failed'
      });
    }

    const { riskLevel, reason } = validation.data;
    let alertCreated = false;

    // If high risk — automatically create alert
    if (riskLevel === 'high') {
      const hindiMessage = await generateSafetyMessage(
        'suspicious transaction',
        `Amount: ${amount}, Recipient: ${recipient}`,
        'hindi'
      );

      await Alert.create({
        elderId,
        type: 'fraud',
        severity: riskLevel,
        message: reason,
        messageHindi: hindiMessage
      });

      // Reduce safety score
      elder.safetyScore = Math.max(0, elder.safetyScore - 20);
      await elder.save();
      alertCreated = true;
    }

    res.status(200).json({
      success: true,
      analysis: { riskLevel, reason },
      alertCreated,
      updatedSafetyScore: elder.safetyScore
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// GET HINDI GUIDANCE FOR ELDER
const getHindiGuidance = async (req, res) => {
  try {
    const { task } = req.body;

    const guidance = await generateHindiGuidance(task);

    if (!guidance) {
      return res.status(500).json({
        success: false,
        message: 'AI guidance generation failed'
      });
    }

    res.status(200).json({
      success: true,
      task,
      guidance
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// GENERATE SAFETY MESSAGE FOR ELDER
const getSafetyMessage = async (req, res) => {
  try {
    const { alertType, details, language } = req.body;

    const message = await generateSafetyMessage(
      alertType,
      details,
      language || 'hindi'
    );

    if (!message) {
      return res.status(500).json({
        success: false,
        message: 'AI message generation failed'
      });
    }

    res.status(200).json({
      success: true,
      message
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  analyzeTransaction,
  getHindiGuidance,
  getSafetyMessage
};