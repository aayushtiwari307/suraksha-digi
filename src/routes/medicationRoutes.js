// src/routes/medicationRoutes.js

const express = require('express');
const router = express.Router();
const {
  addMedication,
  getTodayMedications,
  markTaken,
} = require('../controllers/medicationController');
const protect = require('../middleware/authMiddleware');
const { verifyElderOwnership } = require('../middleware/ownershipMiddleware');

// Same convention as transactionRoutes.js — medication creation is a
// family-managed action, not something an elder does for themselves.
// Without this, verifyElderOwnership alone isn't enough: an elder "owns"
// themselves, so an elder JWT submitting their own elderId would pass
// ownership and reach the controller, which has no role check of its own.
const requireFamily = (req, res, next) => {
  if (req.user?.role !== 'family') {
    return res.status(403).json({
      success: false,
      message: 'Only a family account can add medication',
    });
  }
  next();
};

// POST /api/medications/add — family only
router.post('/add', protect, requireFamily, verifyElderOwnership, addMedication);

// GET /api/medications/elder/:elderId — family or elder
router.get('/elder/:elderId', protect, verifyElderOwnership, getTodayMedications);

// PUT /api/medications/mark-taken/:medicationId — family or elder
// keyed by medicationId, not elderId — ownership checked inside controller
router.put('/mark-taken/:medicationId', protect, markTaken);

module.exports = router;