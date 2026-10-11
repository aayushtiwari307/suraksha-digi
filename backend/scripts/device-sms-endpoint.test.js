// Exercises the REAL exported HTTP handler mounted on
// POST /api/devices/sms-event — `ingestDeviceSms` in deviceController.js —
// rather than calling processIncomingSms or processTransaction directly.
//
// This exists because a missing-alert bug shipped despite a green test
// suite: the test for it called processTransaction directly, which is NOT
// what Android traffic actually reaches. Android hits ingestDeviceSms ->
// processIncomingSms -> (duplicate check) and the duplicate check had its
// own separate implementation that skipped alert recovery entirely.
// Testing one function below the real entry point hid the bug completely.

const assert = require('assert');
const Module = require('module');

process.env.JWT_SECRET = 'test-secret';

let transactions = [];
let alerts = [];
let elders = [];
let nextId = 1;
const newId = () => `id-${nextId++}`;

const matches = (doc, query) => Object.keys(query).every((key) => {
  const val = query[key];
  if (val && typeof val === 'object' && '$ne' in val) return String(doc[key]) !== String(val.$ne);
  return String(doc[key]) === String(val);
});

const fakeTransactionModel = {
  async create(data) {
    const doc = { _id: newId(), ...data };
    transactions.push(doc);
    return doc;
  },
  findOne(query) {
    return Promise.resolve(transactions.find((d) => matches(d, query)) || null);
  },
  find() {
    const chain = {
      select: () => chain, sort: () => chain, limit: () => chain,
      lean: () => Promise.resolve([]),
      then: (r) => r([]),
    };
    return chain;
  },
};

let alertCreateCount = 0;
const fakeAlertModel = {
  findOne(query) {
    const found = alerts.find((a) => matches(a, query));
    const chain = {
      select: () => Promise.resolve(found || null),
      session: () => Promise.resolve(found || null),
      then: (r) => r(found || null),
    };
    return chain;
  },
};

const fakeAlertService = {
  async createAlertWithScoreUpdate(elder, payload) {
    alertCreateCount += 1;
    const alert = { _id: newId(), ...payload, isResolved: false };
    alerts.push(alert);
    return { alert, updatedSafetyScore: 70 };
  },
};

const fakeElderModel = {
  findById(id) {
    const found = elders.find((e) => String(e._id) === String(id)) || null;
    const chain = { select: () => Promise.resolve(found), then: (r) => r(found) };
    return chain;
  },
};

const fakeDeviceModel = {};
const fakeGemini = {
  async parseTransactionSmsWithGemini() { return null; },
  async generateFraudExplanation() { return null; },
  async generateSafetyMessage() { return null; },
};
const fakeMongoose = {
  Types: { ObjectId: { isValid: () => true } },
  Schema: { Types: { ObjectId: 'ObjectId' } },
  async startSession() { return { withTransaction: async (fn) => fn(), endSession: async () => {} }; },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '../models/Transaction') return fakeTransactionModel;
  if (request === '../models/Alert') return fakeAlertModel;
  if (request === '../models/Elder') return fakeElderModel;
  if (request === '../models/Device') return fakeDeviceModel;
  if (request === './alertService') return fakeAlertService;
  if (request === '../services/alertService') return fakeAlertService;
  if (request === '../config/gemini') return fakeGemini;
  if (request === 'mongoose') return fakeMongoose;
  if (request === 'jsonwebtoken') return { sign: () => 'fake.jwt' };
  return originalLoad.call(this, request, parent, isMain);
};

const { ingestDeviceSms } = require('../src/controllers/deviceController');
Module._load = originalLoad;

const makeRes = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; },
});

const results = [];
const check = (name, condition, detail = '') => {
  results.push({ name, passed: !!condition });
  console.log(`${condition ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
};

const run = async () => {
  const ELDER_ID = 'elder-1';
  const DEVICE_ID = 'device-1';
  const EVENT_ID = 'evt-abc-123';
  const SCAM_SMS = 'Share the OTP to verify your account immediately or it will be blocked.';

  elders = [{ _id: ELDER_ID, name: 'Test Elder', isActive: true, safetyScore: 90 }];

  // Seed the exact broken state: a HIGH-risk transaction that exists, but
  // whose alert-creation step failed (crash / DB hiccup) so no alert exists.
  transactions = [{
    _id: 'txn-high-1',
    elderId: ELDER_ID,
    deviceId: DEVICE_ID,
    eventId: EVENT_ID,
    riskLevel: 'high',
    riskScore: 60,
    aiReason: 'Scam wording detected.',
  }];
  alerts = [];
  alertCreateCount = 0;

  check('Precondition: HIGH transaction exists with NO alert', transactions.length === 1 && alerts.length === 0,
    `transactions=${transactions.length} alerts=${alerts.length}`);

  // Android retries the identical event — the real HTTP handler, real route.
  const req = {
    device: { _id: DEVICE_ID },
    deviceElderId: ELDER_ID,
    body: { rawMessage: SCAM_SMS, eventId: EVENT_ID, sender: 'VM-HDFCBK', receivedAt: new Date().toISOString() },
  };
  const res = makeRes();
  await ingestDeviceSms(req, res);

  check('Retry is reported as a duplicate', res.body?.duplicate === true, `status=${res.statusCode}`);
  check('Retry did NOT create a second transaction', transactions.length === 1, `transactions=${transactions.length}`);
  check('>>> Missing HIGH alert IS recovered on the real Android path', alerts.length === 1,
    `alerts=${alerts.length}`);
  check('Recovered alert is returned in the HTTP response', !!res.body?.alert);
  check('Recovered alert has high severity', res.body?.alert?.severity === 'high');

  // A second retry must not create yet another alert.
  const res2 = makeRes();
  await ingestDeviceSms(req, res2);
  check('Further retries stay idempotent (no duplicate alerts)', alerts.length === 1, `alerts=${alerts.length}`);

  // Control: a LOW-risk duplicate must not have an alert conjured for it.
  transactions = [{
    _id: 'txn-low-1', elderId: ELDER_ID, deviceId: DEVICE_ID, eventId: 'evt-low-1',
    riskLevel: 'low', riskScore: 0,
  }];
  alerts = [];
  const res3 = makeRes();
  await ingestDeviceSms({
    ...req,
    body: { ...req.body, eventId: 'evt-low-1', rawMessage: 'Paid Rs.200 to Local Store.' },
  }, res3);
  check('LOW-risk duplicate does not get an alert invented for it', alerts.length === 0, `alerts=${alerts.length}`);

  const passed = results.filter((r) => r.passed).length;
  console.log(`\n=== DEVICE SMS ENDPOINT SUMMARY ===`);
  console.log(`Cases: ${results.length}`);
  console.log(`Passed: ${passed}/${results.length}`);
  assert.strictEqual(passed, results.length, 'device SMS endpoint regression suite has failures.');
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
