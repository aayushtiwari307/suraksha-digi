const jwt = require('jsonwebtoken');
const Elder = require('../models/Elder');
const Family = require('../models/Family');

const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in headers
    if (req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // No token found
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, no token'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user based on role
    if (decoded.role === 'elder') {
      req.user = await Elder.findById(decoded.id).select('-password');
    } else if (decoded.role === 'family') {
      req.user = await Family.findById(decoded.id).select('-password');
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, user not found'
      });
    }

    req.user.role = decoded.role;
    next();

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Not authorized, invalid token'
    });
  }
};

module.exports = protect;