const express = require('express');
const router = express.Router();
const {
  analyzeTransaction,
  getHindiGuidance,
  getSafetyMessage
} = require('../controllers/aiController');
const protect = require('../middleware/authMiddleware');

// All routes protected
router.post('/analyze-transaction', protect, analyzeTransaction);
router.post('/hindi-guidance', protect, getHindiGuidance);
router.post('/safety-message', protect, getSafetyMessage);

module.exports = router;
