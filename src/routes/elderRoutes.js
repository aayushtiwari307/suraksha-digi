const express = require('express');
const router = express.Router();
const {
  registerElder,
  loginElder,
  getElderProfile
} = require('../controllers/elderController');
const protect = require('../middleware/authMiddleware');

// Public routes
router.post('/register', registerElder);
router.post('/login', loginElder);

// Protected routes
router.get('/profile', protect, getElderProfile);

module.exports = router;