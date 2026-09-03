const express = require('express');
const router = express.Router();
const {
  createAlert,
  getElderAlerts,
  resolveAlert,
  getUnresolvedAlerts
} = require('../controllers/alertController');
const protect = require('../middleware/authMiddleware');
const { verifyElderOwnership } = require('../middleware/ownershipMiddleware');

// All routes are protected + ownership-checked
router.post('/create', protect, verifyElderOwnership, createAlert);
router.get('/elder/:elderId', protect, verifyElderOwnership, getElderAlerts);
router.get('/unresolved/:elderId', protect, verifyElderOwnership, getUnresolvedAlerts);
// resolveAlert is keyed by alertId, not elderId — ownership is checked
// inside the controller after the alert (and its elderId) is loaded.
router.put('/resolve/:alertId', protect, resolveAlert);

module.exports = router;