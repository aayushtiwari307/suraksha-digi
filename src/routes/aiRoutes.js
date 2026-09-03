const express = require('express');
const router = express.Router();
const {
  analyzeTransaction,
  getHindiGuidance,
  getSafetyMessage
} = require('../controllers/aiController');
const protect = require('../middleware/authMiddleware');
const { verifyElderOwnership } = require('../middleware/ownershipMiddleware');

// All routes protected
// analyze-transaction is elder-scoped (elderId in body) — ownership required.
// hindi-guidance / safety-message are generic text-generation helpers with
// no elder-specific data, so no ownership check applies to them.
router.post('/analyze-transaction', protect, verifyElderOwnership, analyzeTransaction);
router.post('/hindi-guidance', protect, getHindiGuidance);
router.post('/safety-message', protect, getSafetyMessage);

module.exports = router;
