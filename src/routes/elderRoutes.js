const express = require('express');
const router = express.Router();
const {
  registerElder,
  loginElder,
  getElderProfile,
  updateElder,
  setElderStatus
} = require('../controllers/elderController');
const protect = require('../middleware/authMiddleware');
const { verifyElderOwnership } = require('../middleware/ownershipMiddleware');

// Elder registration is initiated by an authenticated family member
// (matches the actual product flow — elders are added from the family
// dashboard's "Add Elder" page). This also lets us link the new elder to
// the creating family, which is what ownership checks rely on.
router.post('/register', protect, registerElder);
router.post('/login', loginElder);

// Protected routes
router.get('/profile', protect, getElderProfile);
router.patch('/:elderId', protect, verifyElderOwnership, updateElder);
router.patch('/:elderId/status', protect, verifyElderOwnership, setElderStatus);

module.exports = router;