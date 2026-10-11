const requireFamily = (req, res, next) => {
  if (req.user?.role !== 'family') {
    return res.status(403).json({ success: false, message: 'Only a family account can perform this action' });
  }
  next();
};

module.exports = { requireFamily };
