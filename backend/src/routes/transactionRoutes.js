const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const { verifyElderOwnership } = require('../middleware/ownershipMiddleware');
const { ingestSms, getElderTransactions } = require('../controllers/transactionController');

const requireFamily = (req, res, next) => {
  if (req.user?.role !== 'family') {
    return res.status(403).json({
      success: false,
      message: 'Only a family account can use transaction monitoring tools',
    });
  }
  next();
};

router.post('/ingest-sms', protect, requireFamily, verifyElderOwnership, ingestSms);
router.get('/elder/:elderId', protect, requireFamily, verifyElderOwnership, getElderTransactions);

module.exports = router;
