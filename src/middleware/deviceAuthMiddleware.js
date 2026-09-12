const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Device = require('../models/Device');
const Elder = require('../models/Elder');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const verifyDeviceAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Device authorization required' });
    }

    const token = header.slice(7).trim();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== 'device' || !decoded.deviceId || !decoded.elderId) {
      return res.status(401).json({ success: false, message: 'Invalid device credentials' });
    }

    const device = await Device.findOne({
      _id: decoded.deviceId,
      elderId: decoded.elderId,
      tokenHash: hashToken(token),
      isActive: true,
    });

    if (!device) {
      return res.status(401).json({ success: false, message: 'Device is not paired or has been revoked' });
    }

    const elder = await Elder.findById(device.elderId).select('_id isActive');
    if (!elder) {
      return res.status(404).json({ success: false, message: 'Linked elder not found' });
    }

    if (elder.isActive === false) {
      return res.status(403).json({ success: false, message: 'Linked elder account is inactive' });
    }

    req.device = device;
    req.deviceElderId = elder._id;

    Device.updateOne({ _id: device._id }, { $set: { lastSeenAt: new Date() } }).catch(() => {});

    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid device credentials' });
  }
};

module.exports = { verifyDeviceAuth, hashToken };
