const Family = require('../models/Family');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validateFamilyRegistration, validateLogin } = require('../utils/validators');

// REGISTER FAMILY MEMBER
const registerFamily = async (req, res) => {
  try {
    const validation = validateFamilyRegistration(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

    const { name, phone, password } = req.body;

    const existingFamily = await Family.findOne({ phone });
    if (existingFamily) {
      return res.status(400).json({
        success: false,
        message: 'Family member with this phone number already exists'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const family = await Family.create({
      name,
      phone,
      password: hashedPassword
    });

    const token = jwt.sign(
      { id: family._id, role: 'family' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      message: 'Family member registered successfully',
      token,
      family: {
        id: family._id,
        name: family.name,
        phone: family.phone
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

// LOGIN FAMILY MEMBER
const loginFamily = async (req, res) => {
  try {
    const validation = validateLogin(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

    const { phone, password } = req.body;

    const family = await Family.findOne({ phone });
    if (!family) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone or password'
      });
    }

    const isMatch = await bcrypt.compare(password, family.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone or password'
      });
    }

    const token = jwt.sign(
      { id: family._id, role: 'family' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      family: {
        id: family._id,
        name: family.name,
        phone: family.phone
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

// GET FAMILY PROFILE
const getFamilyProfile = async (req, res) => {
  try {
    const family = await Family.findById(req.user.id).select('-password');
    if (!family) {
      return res.status(404).json({
        success: false,
        message: 'Family member not found'
      });
    }

    res.status(200).json({
      success: true,
      family
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// GET ELDERS BELONGING TO THE AUTHENTICATED FAMILY
// Returns only the fields the frontend selector actually needs — no phone,
// no language/isActive flags. req.user is already the authenticated
// family (set by the `protect` middleware), so this can never return
// another family's elders.
const getMyElders = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'family') {
      return res.status(403).json({
        success: false,
        message: 'Only a family account can list elders'
      });
    }

    const family = await Family.findById(req.user.id)
      .populate('elders.elderId', 'name age safetyScore');

    if (!family) {
      return res.status(404).json({
        success: false,
        message: 'Family member not found'
      });
    }

    const elders = family.elders
      .filter(e => e.elderId) // guard against a stale/dangling reference
      .map(e => ({
        _id: e.elderId._id,
        name: e.elderId.name,
        age: e.elderId.age,
        safetyScore: e.elderId.safetyScore,
        relation: e.relation
      }));

    res.status(200).json({
      success: true,
      elders
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
  registerFamily,
  loginFamily,
  getFamilyProfile,
  getMyElders
};