const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Device = require('../models/Device');
const Elder = require('../models/Elder');
const { processIncomingSms } = require('./transactionController');
const { validateDevicePairing, validateDeviceSmsEvent } = require('../utils/validators');

const normalizeCode = (value) => String(value || '').trim().toUpperCase();
const hashValue = (value) => crypto.createHash('sha256').update(value).digest('hex');
const createPairingCode = () => crypto.randomBytes(6).toString('hex').toUpperCase();

const requestDevicePairing = async (req, res) => {
  try {
    if (req.user?.role !== 'family') {
      return res.status(403).json({ success: false, message: 'Only a family account can pair an Android device' });
    }

    const { elderId } = req.params;
    const elder = await Elder.findById(elderId).select('_id name isActive');
    if (!elder) return res.status(404).json({ success: false, message: 'Elder not found' });
    if (elder.isActive === false) return res.status(400).json({ success: false, message: 'Inactive elders cannot be paired with a device' });

    const code = createPairingCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Keep exactly one pending pairing attempt per elder. Existing paired
    // devices remain untouched until a new device actually completes pairing.
    await Device.deleteMany({ elderId, isActive: false, deviceId: { $exists: false } });
    await Device.create({
      elderId,
      pairingCodeHash: hashValue(code),
      pairingCodeExpiresAt: expiresAt,
      isActive: false,
    });

    return res.status(200).json({
      success: true,
      elder: { id: elder._id, name: elder.name },
      pairingCode: code,
      expiresAt,
      expiresInSeconds: 600,
      message: 'Pairing code generated. Enter it in the Android companion within 10 minutes.',
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const pairDevice = async (req, res) => {
  try {
    const validation = validateDevicePairing(req.body);
    if (!validation.valid) return res.status(400).json({ success: false, message: validation.message });
    const code = normalizeCode(req.body?.pairingCode);
    const deviceId = String(req.body?.deviceId || '').trim();

    const pairing = await Device.findOne({
      pairingCodeHash: hashValue(code),
      isActive: false,
      pairingCodeExpiresAt: { $gt: new Date() },
    });

    if (!pairing) {
      return res.status(400).json({ success: false, message: 'Pairing code is invalid or expired' });
    }

    const elder = await Elder.findById(pairing.elderId).select('_id name isActive');
    if (!elder) return res.status(404).json({ success: false, message: 'Linked elder not found' });
    if (elder.isActive === false) return res.status(403).json({ success: false, message: 'This elder account is inactive' });

    // This project intentionally supports one active companion per elder.
    await Device.updateMany(
      { elderId: elder._id, _id: { $ne: pairing._id }, isActive: true },
      { $set: { isActive: false }, $unset: { tokenHash: '', deviceId: '' } }
    );

    // A single Android installation should not remain authorized for a
    // previous elder if it is paired again.
    await Device.updateMany(
      { deviceId, _id: { $ne: pairing._id } },
      { $set: { isActive: false }, $unset: { tokenHash: '', deviceId: '' } }
    );

    // Reusing the same Android installation should rotate its credential.
    const tokenIssuedAt = Math.floor(Date.now() / 1000);
    const deviceJwt = jwt.sign(
      { role: 'device', deviceId: pairing._id, elderId: elder._id, iat: tokenIssuedAt },
      process.env.JWT_SECRET,
      { expiresIn: '90d' }
    );

    pairing.deviceId = deviceId;
    pairing.tokenHash = hashValue(deviceJwt);
    pairing.pairedAt = new Date();
    pairing.lastSeenAt = new Date();
    pairing.isActive = true;
    pairing.pairingCodeHash = null;
    pairing.pairingCodeExpiresAt = null;
    await pairing.save();

    return res.status(200).json({
      success: true,
      message: 'Android device paired successfully',
      token: deviceJwt,
      device: {
        id: pairing._id,
        deviceId: pairing.deviceId,
        elderId: pairing.elderId,
        elderName: elder.name,
        pairedAt: pairing.pairedAt,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const ingestDeviceSms = async (req, res) => {
  try {
    const validation = validateDeviceSmsEvent(req.body);
    if (!validation.valid) return res.status(400).json({ success: false, message: validation.message });
    const rawMessage = String(req.body.rawMessage).trim();
    const sender = String(req.body.sender || '').trim();
    const eventId = String(req.body.eventId).trim();
    const parsedReceivedAt = req.body.receivedAt ? new Date(req.body.receivedAt) : new Date();

    const result = await processIncomingSms({
      elderId: req.deviceElderId,
      rawMessage,
      source: 'android_sms',
      deviceId: req.device._id,
      eventId,
      receivedAt: parsedReceivedAt,
      sender,
    });

    return res.status(result.duplicate ? 200 : 201).json({
      success: true,
      message: result.duplicate ? 'This SMS event was already processed' : 'SMS event processed successfully',
      duplicate: result.duplicate,
      parser: result.parser,
      transaction: result.transaction,
      alert: result.alert,
    });
  } catch (error) {
    console.error(error);
    const status = error.statusCode || 500;
    return res.status(status).json({ success: false, message: status === 500 ? 'Server error' : error.message });
  }
};

const unpairDevice = async (req, res) => {
  try {
    const device = await Device.findById(req.device._id);
    if (device) {
      device.isActive = false;
      device.lastSeenAt = new Date();
      device.set('tokenHash', undefined);
      await device.save();
    }
    return res.status(200).json({ success: true, message: 'Device unpaired successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { requestDevicePairing, pairDevice, ingestDeviceSms, unpairDevice };
