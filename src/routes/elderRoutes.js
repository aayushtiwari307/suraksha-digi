const express = require('express');
const router = express.Router();
const {
  registerElder,
  loginElder,
  getElderProfile
} = require('../controllers/elderController');
const protect = require('../middleware/authMiddleware');

// Elder registration is initiated by an authenticated family member
// (matches the actual product flow — elders are added from the family
// dashboard's "Add Elder" page). This also lets us link the new elder to
// the creating family, which is what ownership checks rely on.
router.post('/register', protect, registerElder);
router.post('/login', loginElder);

// Protected routes
router.get('/profile', protect, getElderProfile);

module.exports = router;