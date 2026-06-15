const express = require('express');
const router = express.Router();
const {
  createAlert,
  getElderAlerts,
  resolveAlert,
  getUnresolvedAlerts
} = require('../controllers/alertController');
const protect = require('../middleware/authMiddleware');

// All routes are protected
router.post('/create', protect, createAlert);
router.get('/elder/:elderId', protect, getElderAlerts);
router.get('/unresolved/:elderId', protect, getUnresolvedAlerts);
router.put('/resolve/:alertId', protect, resolveAlert);

module.exports = router;