const assert = require('assert');
const Module = require('module');

process.env.JWT_SECRET = 'test-secret';

let devices = [];
let nextId = 1;
const newId = () => `device-${nextId++}`;

const matches = (doc, query) => Object.keys(query).every((key) => {
  const val = query[key];
  if (val && typeof val === 'object' && '$gt' in val) return doc[key] instanceof Date && doc[key] > val.$gt;
  if (val && typeof val === 'object' && '$ne' in val) return String(doc[key]) !== String(val.$ne);
  return doc[key] === val;
});

const fakeDeviceModel = {
  // findOneAndUpdate: atomically finds a matching doc and applies $set in
  // the same synchronous tick, mirroring MongoDB's real atomicity guarantee
  // for a single findOneAndUpdate call.
  async findOneAndUpdate(query, update) {
    const found = devices.find((d) => matches(d, query));
    if (!found) return null;
    if (update.$set) Object.assign(found, update.$set);
    if (!found.save) found.save = async () => {};
    return found;
  },
  async updateMany(query, update) {
    devices.filter((d) => matches(d, query)).forEach((d) => {
      if (update.$set) Object.assign(d, update.$set);
      if (update.$unset) Object.keys(update.$unset).forEach((k) => delete d[k]);
    });
  },
};

const fakeElderModel = {
  findById(id) {
    const chain = { select: () => Promise.resolve({ _id: id, name: 'Test Elder', isActive: true }) };
    return chain;
  },
};

const fakeJwt = {
  sign(payload, secret, options) {
    return `fake.jwt.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  },
};

const fakeMongoose = {
  Types: { ObjectId: { isValid: () => true } },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '../models/Device') return fakeDeviceModel;
  if (request === '../models/Elder') return fakeElderModel;
  if (request === './transactionController') return { processIncomingSms: async () => ({}) };
  if (request === 'jsonwebtoken') return fakeJwt;
  if (request === 'mongoose') return fakeMongoose;
  return originalLoad.call(this, request, parent, isMain);
};

const { pairDevice } = require('../src/controllers/deviceController');
Module._load = originalLoad;

const makeRes = () => {
  let body = null;
  return {
    status(code) { this.statusCode = code; return this; },
    json(payload) { body = payload; this.body = payload; return this; },
    get result() { return { statusCode: this.statusCode || 200, body }; },
  };
};

const results = [];
const check = (name, condition, detail = '') => {
  results.push({ name, passed: !!condition });
  console.log(`${condition ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
};

const run = async () => {
  const code = 'ABCDEF123456';
  const codeHash = require('crypto').createHash('sha256').update(code).digest('hex');

  devices = [{
    _id: 'pairing-1',
    elderId: 'elder-1',
    pairingCodeHash: codeHash,
    pairingCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    isActive: false,
  }];

  const req1 = { body: { pairingCode: code, deviceId: 'android-device-aaaa1111' } };
  const req2 = { body: { pairingCode: code, deviceId: 'android-device-bbbb2222' } };
  const res1 = makeRes();
  const res2 = makeRes();

  // Fire both "requests" concurrently, same as two racing HTTP calls.
  await Promise.all([pairDevice(req1, res1), pairDevice(req2, res2)]);

  const outcomes = [res1.result.statusCode, res2.result.statusCode].sort();
  check(
    'Exactly one of two concurrent pairing attempts with the same code succeeds',
    outcomes[0] === 200 && outcomes[1] === 400,
    `statusCodes=${outcomes.join(',')}`
  );

  const activeDevices = devices.filter((d) => d.isActive);
  check('Exactly one device ends up paired/active', activeDevices.length === 1, `active=${activeDevices.length}`);

  // A third attempt with the same (now-consumed) code must also fail.
  const res3 = makeRes();
  await pairDevice({ body: { pairingCode: code, deviceId: 'android-device-cccc3333' } }, res3);
  check('Reusing the same code after it was consumed fails', res3.result.statusCode === 400);

  const passed = results.filter((r) => r.passed).length;
  console.log(`\n=== DEVICE PAIRING RACE SUMMARY ===`);
  console.log(`Cases: ${results.length}`);
  console.log(`Passed: ${passed}/${results.length}`);
  assert.strictEqual(passed, results.length, 'device pairing race regression suite has failures.');
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
