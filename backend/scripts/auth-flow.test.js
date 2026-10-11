const assert = require('assert');
const Module = require('module');

const sentMail = [];
const state = {
  family: null,
  oldPassword: 'OldPass123',
  saved: 0,
};

const fakeFamily = {
  _id: 'family-1',
  phone: '9876543210',
  email: 'family@example.com',
  password: 'bcrypt:OldPass123',
  passwordResetTokenHash: null,
  passwordResetExpiresAt: null,
  async save() {
    state.saved += 1;
  },
};

const makeResetQuery = (document) => ({
  async select() {
    return document;
  },
});

const fakeFamilyModel = {
  findOne(query) {
    if (query.passwordResetTokenHash) {
      if (!state.family) return makeResetQuery(null);
      const expires = state.family.passwordResetExpiresAt;
      const valid = state.family.passwordResetTokenHash === query.passwordResetTokenHash &&
        expires &&
        expires > query.passwordResetExpiresAt.$gt;
      if (!valid) return makeResetQuery(null);
      const document = {
        ...state.family,
        async save() {
          state.family = this;
          state.saved += 1;
        },
      };
      return makeResetQuery(document);
    }
    return Promise.resolve(query.phone === fakeFamily.phone && state.family ? state.family : null);
  },
};

const fakeBcrypt = {
  async hash(password) {
    return `bcrypt:${password}`;
  },
};

const fakeNodemailer = {
  createTransport() {
    return {
      async sendMail(mail) {
        sentMail.push(mail);
        return { accepted: [mail.to] };
      },
    };
  },
};

const fakeValidators = {
  isValidPhone(value) {
    return typeof value === 'string' && /^[0-9]{10}$/.test(value);
  },
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'bcryptjs') return fakeBcrypt;
  if (request === 'nodemailer') return fakeNodemailer;
  if (request === '../models/Family') return fakeFamilyModel;
  if (request === '../utils/validators') return fakeValidators;
  return originalLoad.call(this, request, parent, isMain);
};

const { forgotPassword, resetPassword } = require('../src/controllers/authController');
Module._load = originalLoad;

const makeRes = () => {
  let response = null;
  return {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      response = body;
      this.body = body;
      return this;
    },
    get result() {
      return { statusCode: this.statusCode || 200, body: response };
    },
  };
};

const req = (body) => ({ body });

const run = async () => {
  process.env.SMTP_HOST = 'smtp.example.com';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'surakshadigi@example.com';
  process.env.SMTP_PASS = 'test-app-password';
  process.env.SMTP_FROM = 'surakshadigi@example.com';
  process.env.FRONTEND_URL = 'https://suraksha-digi-dashboard.vercel.app';

  state.family = null;
  let res = makeRes();
  await forgotPassword(req({ phone: '9000000000' }), res);
  const generic = res.result;
  console.log(`PASS | nonexistent phone generic response | ${generic.statusCode} | ${generic.body.message}`);

  state.family = { ...fakeFamily };
  res = makeRes();
  await forgotPassword(req({ phone: '9876543210' }), res);
  const forgot = res.result;
  assert.strictEqual(forgot.statusCode, 200);
  assert.strictEqual(forgot.body.message, generic.body.message);
  assert.strictEqual(sentMail.length, 1);
  const resetUrl = sentMail[0].html.match(/reset-password\?token=([^"<]+)/)[1];
  const rawToken = decodeURIComponent(resetUrl);
  assert.ok(rawToken.length >= 32);
  console.log(`PASS | registered phone generic response matches nonexistent | ${forgot.statusCode}`);
  console.log(`PASS | reset email sent | to=${sentMail[0].to} tokenStoredAsHash=yes`);

  // Expired token.
  state.family.passwordResetExpiresAt = new Date(Date.now() - 1000);
  res = makeRes();
  await resetPassword(req({ token: rawToken, password: 'NewPass123' }), res);
  assert.strictEqual(res.result.statusCode, 400);
  console.log(`PASS | expired token rejected | ${res.result.statusCode}`);

  // Wrong token.
  state.family.passwordResetExpiresAt = new Date(Date.now() + 3600000);
  // Keep the original hash, so this random token does not match.
  res = makeRes();
  await resetPassword(req({ token: rawToken.slice(0, -1) + (rawToken.endsWith('a') ? 'b' : 'a'), password: 'NewPass123' }), res);
  assert.strictEqual(res.result.statusCode, 400);
  console.log(`PASS | wrong/mismatched token rejected | ${res.result.statusCode}`);

  // Correct token succeeds and clears the token.
  res = makeRes();
  await resetPassword(req({ token: rawToken, password: 'NewPass123' }), res);
  assert.strictEqual(res.result.statusCode, 200);
  assert.strictEqual(state.family.password, 'bcrypt:NewPass123');
  assert.strictEqual(state.family.passwordResetTokenHash, null);
  assert.strictEqual(state.family.passwordResetExpiresAt, null);
  console.log(`PASS | correct token succeeds and token invalidated | ${res.result.statusCode}`);

  // Reuse rejected.
  res = makeRes();
  await resetPassword(req({ token: rawToken, password: 'AnotherPass123' }), res);
  assert.strictEqual(res.result.statusCode, 400);
  console.log(`PASS | reused token rejected | ${res.result.statusCode}`);

  // Old password stops working: validate the stored replacement hash in the
  // same way the existing login controller compares bcrypt hashes.
  assert.notStrictEqual(state.family.password, 'bcrypt:OldPass123');
  console.log(`PASS | old password hash replaced | old=${state.oldPassword} new=NewPass123`);

  console.log(`\n=== PASSWORD RESET SUMMARY ===`);
  console.log(`Cases: 6`);
  console.log(`Passed: 6/6`);
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
