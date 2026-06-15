const Alert = require('../models/Alert');
const Elder = require('../models/Elder');

const JWT_SECRET = '***REMOVED***';

// CREATE ALERT
const createAlert = async (req, res) => {
  try {
    const { elderId, type, severity, message, messageHindi } = req.body;

    // Check if elder exists
    const elder = await Elder.findById(elderId);
    if (!elder) {
      return res.status(404).json({
        success: false,
        message: 'Elder not found'
      });
    }

    // Create alert
    const alert = await Alert.create({
      elderId,
      type,
      severity: severity || 'medium',
      message,
      messageHindi
    });

    // Update elder safety score based on severity
    if (severity === 'high') {
      elder.safetyScore = Math.max(0, elder.safetyScore - 20);
    } else if (severity === 'medium') {
      elder.safetyScore = Math.max(0, elder.safetyScore - 10);
    } else {
      elder.safetyScore = Math.max(0, elder.safetyScore - 5);
    }
    await elder.save();

    res.status(201).json({
      success: true,
      message: 'Alert created successfully',
      alert,
      updatedSafetyScore: elder.safetyScore
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// GET ALL ALERTS FOR AN ELDER
const getElderAlerts = async (req, res) => {
  try {
    const { elderId } = req.params;

    const alerts = await Alert.find({ elderId })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: alerts.length,
      alerts
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// RESOLVE ALERT
const resolveAlert = async (req, res) => {
  try {
    const { alertId } = req.params;

    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
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
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
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
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

module.exports = {
  createAlert,
  getElderAlerts,
  resolveAlert,
  getUnresolvedAlerts
};