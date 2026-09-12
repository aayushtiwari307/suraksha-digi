const express = require('express');
const router = express.Router();
const { pairDevice, ingestDeviceSms, unpairDevice } = require('../controllers/deviceController');
const { verifyDeviceAuth } = require('../middleware/deviceAuthMiddleware');
const { devicePairLimiter } = require('../middleware/rateLimiter');

router.post('/pair', devicePairLimiter, pairDevice);
router.post('/sms-event', verifyDeviceAuth, ingestDeviceSms);
router.delete('/me', verifyDeviceAuth, unpairDevice);

module.exports = router;
