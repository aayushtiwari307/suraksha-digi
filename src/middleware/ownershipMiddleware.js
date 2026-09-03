const { userOwnsElder } = require('../utils/ownership');

// For routes where the target elder is directly identified — either as a
// :elderId route param or an elderId field in the body. Must run after
// `protect` (needs req.user already populated).
const verifyElderOwnership = (req, res, next) => {
  const elderId = req.params.elderId || req.body.elderId;

  if (!elderId) {
    return res.status(400).json({
      success: false,
      message: 'elderId is required'
    });
  }

  if (!userOwnsElder(req.user, elderId)) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access this elder\'s data'
    });
  }

  next();
};

module.exports = { verifyElderOwnership };
