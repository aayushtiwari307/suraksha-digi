const {
  generateSafetyMessage,
  analyzeFraudRisk,
  generateHindiGuidance
} = require('../config/gemini');
const Alert = require('../models/Alert');
const Elder = require('../models/Elder');

// ANALYZE TRANSACTION FOR FRAUD
const analyzeTransaction = async (req, res) => {
  try {
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
    const transactionDetails = {
      amount,
      recipient,
      time,
      description,
      elderAge: elder.age,
      unusualAmount: amount > 5000
    };

    // Ask Gemini to analyze
    const fraudAnalysis = await analyzeFraudRisk(transactionDetails);

    if (!fraudAnalysis) {
      return res.status(500).json({
        success: false,
        message: 'AI analysis failed'
      });
    }

    // If high risk — automatically create alert
    if (fraudAnalysis.riskLevel === 'high') {
      const hindiMessage = await generateSafetyMessage(
        'suspicious transaction',
        `Amount: ${amount}, Recipient: ${recipient}`,
        'hindi'
      );

      await Alert.create({
        elderId,
        type: 'fraud',
        severity: 'high',
        message: fraudAnalysis.reason,
        messageHindi: hindiMessage
      });

      // Reduce safety score
      elder.safetyScore = Math.max(0, elder.safetyScore - 20);
      await elder.save();
    }

    res.status(200).json({
      success: true,
      analysis: fraudAnalysis,
      alertCreated: fraudAnalysis.riskLevel === 'high',
      updatedSafetyScore: elder.safetyScore
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
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
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
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
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

module.exports = {
  analyzeTransaction,
  getHindiGuidance,
  getSafetyMessage
};