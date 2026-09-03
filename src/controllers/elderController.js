const Elder = require('../models/Elder');
const Family = require('../models/Family');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validateElderRegistration, validateLogin } = require('../utils/validators');

// REGISTER ELDER
// Called by an authenticated family member from the "Add Elder" page.
// Creates the elder AND links it to the creating family so ownership
// checks on alerts/medications/AI endpoints have something to check against.
const registerElder = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'family') {
      return res.status(403).json({
        success: false,
        message: 'Only a family account can register an elder'
      });
    }

    const validation = validateElderRegistration(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

    const { name, phone, age, language, password, relation } = req.body;

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

    // Link the new elder to the creating family so ownership checks pass.
    await Family.findByIdAndUpdate(req.user._id, {
      $push: {
        elders: {
          elderId: elder._id,
          relation: relation || 'family member',
          canViewAlerts: true
        }
      }
    });

    const token = jwt.sign(
      { id: elder._id, role: 'elder' },
      process.env.JWT_SECRET,
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
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// LOGIN ELDER
const loginElder = async (req, res) => {
  try {
    const validation = validateLogin(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

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
      process.env.JWT_SECRET,
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
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
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
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  registerElder,
  loginElder,
  getElderProfile
};