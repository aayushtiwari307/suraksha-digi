const Elder = require('../models/Elder');
const Family = require('../models/Family');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validateElderRegistration, validateElderUpdate, validateLogin, isValidObjectId } = require('../utils/validators');

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

    if (elder.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'This elder account is currently inactive'
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



const updateElder = async (req, res) => {
  try {
    if (req.user?.role !== 'family') {
      return res.status(403).json({ success: false, message: 'Only a family account can update an elder' });
    }
    const { elderId } = req.params;
    if (!isValidObjectId(elderId)) {
      return res.status(400).json({ success: false, message: 'Invalid elder ID' });
    }
    const validation = validateElderUpdate(req.body);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const elder = await Elder.findById(elderId);
    if (!elder) return res.status(404).json({ success: false, message: 'Elder not found' });

    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name.trim();
    if (req.body.age !== undefined) updates.age = Number(req.body.age);
    if (req.body.language !== undefined) updates.language = req.body.language;
    if (Object.keys(updates).length) Object.assign(elder, updates);
    await elder.save();

    if (req.body.relation !== undefined) {
      await Family.updateOne(
        { _id: req.user._id, 'elders.elderId': elder._id },
        { $set: { 'elders.$.relation': req.body.relation.trim() } }
      );
    }

    const familyLink = await Family.findOne({ _id: req.user._id, 'elders.elderId': elder._id });
    const relation = familyLink?.elders?.find(e => e.elderId?.toString() === elder._id.toString())?.relation || 'family member';

    return res.status(200).json({
      success: true,
      message: 'Elder updated successfully',
      elder: { _id: elder._id, name: elder.name, age: elder.age, language: elder.language, safetyScore: elder.safetyScore, isActive: elder.isActive, relation }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const setElderStatus = async (req, res) => {
  try {
    if (req.user?.role !== 'family') {
      return res.status(403).json({ success: false, message: 'Only a family account can change elder status' });
    }
    const { elderId } = req.params;
    if (!isValidObjectId(elderId)) {
      return res.status(400).json({ success: false, message: 'Invalid elder ID' });
    }
    if (typeof req.body?.isActive !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isActive must be true or false' });
    }

    const elder = await Elder.findByIdAndUpdate(
      elderId,
      { isActive: req.body.isActive },
      { new: true, runValidators: true }
    ).select('-password');

    if (!elder) return res.status(404).json({ success: false, message: 'Elder not found' });

    return res.status(200).json({
      success: true,
      message: elder.isActive ? 'Elder reactivated successfully' : 'Elder deactivated successfully',
      elder
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  registerElder,
  loginElder,
  getElderProfile,
  updateElder,
  setElderStatus
};