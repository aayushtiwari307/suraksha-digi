const Alert = require('../models/Alert');
const Elder = require('../models/Elder');
const MedicationLog = require('../models/MedicationLog');
const Medication = require('../models/Medication');
const Transaction = require('../models/Transaction');
const { userOwnsElder } = require('../utils/ownership');
const { validateAlertCreation, isValidObjectId } = require('../utils/validators');
const { createAlertWithScoreUpdate } = require('../services/alertService');

// CREATE ALERT
const createAlert = async (req, res) => {
  try {
    const validation = validateAlertCreation(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

    const { elderId, type, severity, message, messageHindi } = req.body;

    // Check if elder exists
    const elder = await Elder.findById(elderId);
    if (!elder) {
      return res.status(404).json({
        success: false,
        message: 'Elder not found'
      });
    }

    const { alert, updatedSafetyScore } = await createAlertWithScoreUpdate(elder, {
      elderId, type, severity, message, messageHindi
    });

    res.status(201).json({
      success: true,
      message: 'Alert created successfully',
      alert,
      updatedSafetyScore
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// GET ALL ALERTS FOR AN ELDER
const getElderAlerts = async (req, res) => {
  try {
    const { elderId } = req.params;

    const alerts = await Alert.find({ elderId }).sort({ createdAt: -1 }).lean();
    const enrichedAlerts = await Promise.all(alerts.map(async (alert) => {
      if (!alert.sourceType || !alert.sourceId) return alert;

      if (alert.sourceType === 'transaction') {
        const transaction = await Transaction.findById(alert.sourceId)
          .select('amount recipient transactionType transactionTime riskScore riskLevel')
          .lean();
        return { ...alert, source: transaction ? { type: 'transaction', transaction } : null };
      }

      if (alert.sourceType === 'medication') {
        const log = await MedicationLog.findById(alert.sourceId).select('date status takenAt medicationId').lean();
        if (!log) return { ...alert, source: null };
        const medication = await Medication.findById(log.medicationId)
          .select('medicineName dosage scheduledTime')
          .lean();
        return { ...alert, source: { type: 'medication', log, medication } };
      }
      return alert;
    }));

    res.status(200).json({
      success: true,
      count: enrichedAlerts.length,
      alerts: enrichedAlerts
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// RESOLVE ALERT
const resolveAlert = async (req, res) => {
  try {
    const { alertId } = req.params;

    if (!isValidObjectId(alertId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid alert ID'
      });
    }

    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    if (!userOwnsElder(req.user, alert.elderId)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to resolve this alert'
      });
    }

    alert.isResolved = true;
    alert.resolvedBy = req.user.id;
    await alert.save();

    res.status(200).json({
      success: true,
      message: 'Alert resolved successfully',
      alert
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// RECORD FRAUD ALERT OUTCOME
const recordFraudOutcome = async (req, res) => {
  try {
    const { elderId, alertId } = req.params;
    const { outcome } = req.body || {};

    if (!isValidObjectId(elderId) || !isValidObjectId(alertId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid elder or alert ID'
      });
    }

    if (!['confirmed_fraud', 'false_positive'].includes(outcome)) {
      return res.status(400).json({
        success: false,
        message: 'Outcome must be confirmed_fraud or false_positive'
      });
    }

    const alert = await Alert.findOne({ _id: alertId, elderId });
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    if (alert.type !== 'fraud') {
      return res.status(400).json({
        success: false,
        message: 'Only fraud alerts can have a fraud outcome'
      });
    }

    alert.reviewOutcome = outcome;
    alert.reviewedBy = req.user.id;
    alert.reviewedAt = new Date();
    // A real-world outcome means the family has reviewed the alert. Keep the
    // existing isResolved concept rather than adding a second "closed" flag.
    alert.isResolved = true;
    alert.resolvedBy = req.user.id;
    await alert.save();

    return res.status(200).json({
      success: true,
      message: 'Fraud alert outcome recorded successfully',
      alert
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// GET UNRESOLVED ALERTS
const getUnresolvedAlerts = async (req, res) => {
  try {
    const { elderId } = req.params;

    const alerts = await Alert.find({
      elderId,
      isResolved: false
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: alerts.length,
      alerts
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
  createAlert,
  getElderAlerts,
  resolveAlert,
  recordFraudOutcome,
  getUnresolvedAlerts
};