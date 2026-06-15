const Family = require('../models/Family');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = '***REMOVED***';

// REGISTER FAMILY MEMBER
const registerFamily = async (req, res) => {
  try {
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
      JWT_SECRET,
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
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// LOGIN FAMILY MEMBER
const loginFamily = async (req, res) => {
  try {
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
      JWT_SECRET,
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
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
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
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

module.exports = {
  registerFamily,
  loginFamily,
  getFamilyProfile
};