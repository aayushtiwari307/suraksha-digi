const assert = require('assert');
const Module = require('module');

// ---- in-memory fake collections -------------------------------------------------
let transactions = [];
let alerts = [];
let nextId = 1;
const newId = () => `id-${nextId++}`;

// Set this to force the *next* Transaction.create() call to throw a MongoDB
// duplicate-key error, to simulate a concurrent request winning the race
// between our findOne() checks and our create().
let forceDuplicateKeyErrorOnce = false;

const matches = (doc, query) => Object.keys(query).every((key) => {
  if (query[key] && typeof query[key] === 'object' && '$ne' in query[key]) {
    return doc[key] !== query[key].$ne;
  }
  return String(doc[key]) === String(query[key]);
});

const fakeTransactionModel = {
  async create(data) {
    if (forceDuplicateKeyErrorOnce) {
      forceDuplicateKeyErrorOnce = false;
      const err = new Error('E11000 duplicate key error');
      err.code = 11000;
      throw err;
    }
    const doc = { _id: newId(), ...data };
    transactions.push(doc);
    return doc;
  },
  findOne(query) {
    // Only match on keys actually present in the query (mirrors Mongo:
    // querying {deviceId, eventId} should not match docs missing those
    // fields unless the query itself omits them).
    const found = transactions.find((doc) => matches(doc, query));
    return Promise.resolve(found || null);
  },
  find() {
    const self = {
      _docs: [],
      select() { return self; },
      sort() { return self; },
      limit() { return self; },
      lean() { return Promise.resolve(self._docs); },
      then(resolve) { resolve(self._docs); },
    };
    return self;
  },
};

const fakeAlertModel = {
  findOne(query) {
    const found = alerts.find((a) => matches(a, query));
    const chain = {
      select() { return Promise.resolve(found || null); },
    };
    return chain;
  },
};

let createAlertCallCount = 0;
const fakeAlertService = {
  async createAlertWithScoreUpdate(elder, payload) {
    createAlertCallCount += 1;
    const alert = { _id: newId(), ...payload, isResolved: false };
    alerts.push(alert);
    return { alert, updatedSafetyScore: 80 };
  },
};

const fakeElderModel = {
  findById(id) {
    return Promise.resolve({ _id: id, isActive: true });
  },
};

const fakeGemini = {
  async generateFraudExplanation() { return null; },
  async generateSafetyMessage() { return null; },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '../models/Transaction') return fakeTransactionModel;
  if (request === '../models/Alert') return fakeAlertModel;
  if (request === '../models/Elder') return fakeElderModel;
  if (request === './alertService') return fakeAlertService;
  if (request === '../config/gemini') return fakeGemini;
  return originalLoad.call(this, request, parent, isMain);
};

const { processTransaction } = require('../src/services/fraudService');
Module._load = originalLoad;

const results = [];
const check = (name, condition, detail = '') => {
  results.push({ name, passed: !!condition });
  console.log(`${condition ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
};

const baseInput = (overrides = {}) => ({
  elderId: 'elder-1',
  rawMessage: 'Paid Rs.100 to Test Shop',
  amount: 100,
  recipient: 'Test Shop',
  transactionType: 'debit',
  transactionTime: new Date('2026-09-15T10:00:00+05:30'),
  ...overrides,
});

const run = async () => {
  // 1. Fresh simulation transaction: low risk, no deviceId/eventId at all.
  transactions = [];
  alerts = [];
  createAlertCallCount = 0;
  const r1 = await processTransaction(baseInput());
  check('New simulation transaction is created (not duplicate)', r1.duplicate === false);
  check(
    'Simulation transaction does not persist deviceId/eventId keys at all',
    !('deviceId' in r1.transaction) && !('eventId' in r1.transaction),
    `keys=${Object.keys(r1.transaction).filter(k => k === 'deviceId' || k === 'eventId').join(',') || 'none'}`
  );

  // 2. Same fingerprint again -> duplicate, existing alert (none, since low risk) reused, no new alert created.
  const r2 = await processTransaction(baseInput());
  check('Repeated identical simulation SMS is treated as duplicate', r2.duplicate === true);
  check('Duplicate of a LOW-risk transaction has no alert', r2.alert === null || r2.alert === undefined);

  // 3. A HIGH-risk transaction whose alert creation is simulated as having failed
  //    the first time (we insert the transaction directly into the fake store
  //    without ever calling alertService, then replay the same input).
  transactions = [];
  alerts = [];
  createAlertCallCount = 0;
  const highInput = baseInput({
    rawMessage: 'Share the OTP to verify your account immediately.',
    recipient: 'Unknown recipient',
    transactionType: 'unknown',
  });
  const r3 = await processTransaction(highInput);
  check('First-time scam-keyword message is scored HIGH', r3.transaction.riskLevel === 'high');
  check('HIGH-risk transaction gets an alert on first processing', !!r3.alert);
  const alertCountAfterFirst = createAlertCallCount;

  // Simulate an alert that failed to persist by removing it from the store,
  // then replay the identical SMS (fingerprint dedup path).
  alerts = [];
  const r4 = await processTransaction(highInput);
  check('Fingerprint-duplicate path is still marked duplicate', r4.duplicate === true);
  check('Fingerprint-duplicate path repairs a missing HIGH alert', !!r4.alert);
  check('Repair created exactly one new alert', createAlertCallCount === alertCountAfterFirst + 1);

  // 4. Same scenario, but via the deviceId+eventId path (the real Android path) —
  //    this is exactly the asymmetry that existed before the fix: only the
  //    fingerprint path used to repair a missing alert.
  transactions = [];
  alerts = [];
  createAlertCallCount = 0;
  const deviceInput = baseInput({
    rawMessage: 'Share the OTP to verify your account immediately.',
    recipient: 'Unknown recipient',
    transactionType: 'unknown',
    source: 'android_sms',
    deviceId: 'device-1',
    eventId: 'evt-1',
  });
  const r5 = await processTransaction(deviceInput);
  check('Device-event HIGH-risk transaction gets an alert on first processing', !!r5.alert);
  alerts = []; // simulate lost alert
  const r6 = await processTransaction(deviceInput);
  check('Device-event duplicate path is marked duplicate', r6.duplicate === true);
  check('Device-event duplicate path repairs a missing HIGH alert (asymmetry fix)', !!r6.alert);

  // 5. E11000 race: create() throws duplicate-key on the "losing" concurrent
  //    request; processTransaction should recover by re-querying rather than
  //    letting the raw error propagate as an unhandled 500.
  transactions = [];
  alerts = [];
  createAlertCallCount = 0;
  const raceInput = baseInput({
    rawMessage: 'UPI debit of Rs.900 to Race Shop',
    recipient: 'Race Shop',
  });
  // Seed the "winning" transaction directly (as if a concurrent request just
  // committed it), then force our own create() call to blow up with E11000.
  const fingerprintModule = require('../src/services/fraudService');
  const winnerFingerprint = fingerprintModule.buildFingerprint({
    elderId: raceInput.elderId,
    rawMessage: raceInput.rawMessage,
    amount: raceInput.amount,
    recipient: raceInput.recipient,
    transactionType: raceInput.transactionType,
    transactionTime: raceInput.transactionTime,
    reference: undefined,
  });
  transactions.push({
    _id: 'winner-1',
    elderId: raceInput.elderId,
    fingerprint: winnerFingerprint,
    riskLevel: 'low',
    aiReason: 'ok',
  });
  forceDuplicateKeyErrorOnce = true;
  const r7 = await processTransaction(raceInput);
  check('E11000 race is recovered as a duplicate instead of throwing', r7.duplicate === true);
  check('E11000 race recovery returns the transaction that won the race', r7.transaction._id === 'winner-1');

  const passed = results.filter(r => r.passed).length;
  console.log(`\n=== FRAUD SERVICE SUMMARY ===`);
  console.log(`Cases: ${results.length}`);
  console.log(`Passed: ${passed}/${results.length}`);
  assert.strictEqual(passed, results.length, 'fraudService regression suite has failures.');
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
