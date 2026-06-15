const Elder = require('../models/Elder');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = '***REMOVED***';

// REGISTER ELDER
const registerElder = async (req, res) => {
  try {
    const { name, phone, age, language, password } = req.body;

    const existingElder = await Elder.findOne({ phone });
    if (existingElder) {
      return res.status(400).json({
        success: false,
        message: 'Elder with this phone number already exists'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const elder = await Elder.create({
      name,
      phone,
      age,
      language: language || 'hindi',
      password: hashedPassword
    });

    const token = jwt.sign(
      { id: elder._id, role: 'elder' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      message: 'Elder registered successfully',
      token,
      elder: {
        id: elder._id,
        name: elder.name,
        phone: elder.phone,
        age: elder.age,
        language: elder.language,
        safetyScore: elder.safetyScore
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// LOGIN ELDER
const loginElder = async (req, res) => {
  try {
    const { phone, password } = req.body;

    const elder = await Elder.findOne({ phone });
    if (!elder) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone or password'
      });
    }

    const isMatch = await bcrypt.compare(password, elder.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone or password'
      });
    }

    const token = jwt.sign(
      { id: elder._id, role: 'elder' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      elder: {
        id: elder._id,
        name: elder.name,
        phone: elder.phone,
        age: elder.age,
        language: elder.language,
        safetyScore: elder.safetyScore
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// GET ELDER PROFILE
const getElderProfile = async (req, res) => {
  try {
    const elder = await Elder.findById(req.user.id).select('-password');
    if (!elder) {
      return res.status(404).json({
        success: false,
        message: 'Elder not found'
      });
    }

    res.status(200).json({
      success: true,
      elder
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

module.exports = {
  registerElder,
  loginElder,
  getElderProfile
};