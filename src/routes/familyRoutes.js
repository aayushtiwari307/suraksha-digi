const express = require('express');
const router = express.Router();
const {
  registerFamily,
  loginFamily,
  getFamilyProfile
} = require('../controllers/familyController');
const protect = require('../middleware/authMiddleware');

// Public routes
router.post('/register', registerFamily);
router.post('/login', loginFamily);

// Protected routes
router.get('/profile', protect, getFamilyProfile);

module.exports = router;