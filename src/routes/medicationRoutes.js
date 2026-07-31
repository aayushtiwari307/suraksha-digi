// src/routes/medicationRoutes.js

const express = require('express');
const router = express.Router();
const {
  addMedication,
  getTodayMedications,
  markTaken,
} = require('../controllers/medicationController');
const protect = require('../middleware/authMiddleware');

// POST /api/medications/add — family only
router.post('/add', protect, addMedication);

// GET /api/medications/elder/:elderId — family or elder
router.get('/elder/:elderId', protect, getTodayMedications);

// PUT /api/medications/mark-taken/:medicationId — family or elder
router.put('/mark-taken/:medicationId', protect, markTaken);

module.exports = router;