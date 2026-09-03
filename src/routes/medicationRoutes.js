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

// POST /api/medications/add — family only
router.post('/add', protect, verifyElderOwnership, addMedication);

// GET /api/medications/elder/:elderId — family or elder
router.get('/elder/:elderId', protect, verifyElderOwnership, getTodayMedications);

// PUT /api/medications/mark-taken/:medicationId — family or elder
// keyed by medicationId, not elderId — ownership checked inside controller
router.put('/mark-taken/:medicationId', protect, markTaken);

module.exports = router;