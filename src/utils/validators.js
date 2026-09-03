const mongoose = require('mongoose');

// ---------- Primitives ----------

const isValidObjectId = (val) =>
  typeof val === 'string' && mongoose.Types.ObjectId.isValid(val) &&
  // ObjectId.isValid accepts some 12-char plain strings too (Mongoose
  // treats any 12-byte string as castable) — restrict to what an actual
  // ObjectId.toString() produces: 24 hex characters.
  /^[0-9a-fA-F]{24}$/.test(val);

const isNonEmptyString = (val, maxLength = 500) => {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength;
};

// Exactly 10 digits — matches the app's actual existing convention
// (no country code, no formatting, stored as-is).
const isValidPhone = (val) =>
  typeof val === 'string' && /^[0-9]{10}$/.test(val);

// 24-hour HH:MM — matches what <input type="time"> always produces,
// and what isMissed() assumes when it splits on ':'.
const isValidTimeString = (val) =>
  typeof val === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(val);

const isFiniteNumber = (val) => {
  const n = typeof val === 'number' ? val : Number(val);
  return typeof val !== 'boolean' && val !== '' && val !== null &&
    Number.isFinite(n);
};

const isPositiveFiniteNumber = (val) => isFiniteNumber(val) && Number(val) > 0;

// Sane bounds for a human age — not a business "elder eligibility" rule,
// just rejecting impossible values (negative, zero, absurd).
const isValidAge = (val) => isFiniteNumber(val) && Number(val) > 0 && Number(val) <= 120;

// ---------- Composite per-endpoint validators ----------
// Each returns { valid: true } or { valid: false, message }.
// Never throws.

const validateFamilyRegistration = (body) => {
  if (!body || typeof body !== 'object') return { valid: false, message: 'Invalid request body' };
  const { name, phone, password } = body;

  if (!isNonEmptyString(name, 100)) {
    return { valid: false, message: 'Name is required and must be under 100 characters' };
  }
  if (!isValidPhone(phone)) {
    return { valid: false, message: 'Phone number must be exactly 10 digits' };
  }
  if (typeof password !== 'string' || password.length === 0) {
    return { valid: false, message: 'Password is required' };
  }
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }

  return { valid: true };
};

const validateLogin = (body) => {
  if (!body || typeof body !== 'object') return { valid: false, message: 'Invalid request body' };
  const { phone, password } = body;

  // Intentionally lenient here — login must not enforce the new 8-char
  // minimum, so existing users with shorter passwords are never locked out.
  if (typeof phone !== 'string' || phone.length === 0) {
    return { valid: false, message: 'Phone is required' };
  }
  if (typeof password !== 'string' || password.length === 0) {
    return { valid: false, message: 'Password is required' };
  }

  return { valid: true };
};

const validateElderRegistration = (body) => {
  if (!body || typeof body !== 'object') return { valid: false, message: 'Invalid request body' };
  const { name, phone, age, language, password, relation } = body;

  if (!isNonEmptyString(name, 100)) {
    return { valid: false, message: 'Name is required and must be under 100 characters' };
  }
  if (!isValidPhone(phone)) {
    return { valid: false, message: 'Phone number must be exactly 10 digits' };
  }
  if (!isValidAge(age)) {
    return { valid: false, message: 'Age must be a valid number between 1 and 120' };
  }
  if (language !== undefined && !['hindi', 'english'].includes(language)) {
    return { valid: false, message: 'Language must be either "hindi" or "english"' };
  }
  if (typeof password !== 'string' || password.length === 0) {
    return { valid: false, message: 'Password is required' };
  }
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }
  if (relation !== undefined && !isNonEmptyString(relation, 100)) {
    return { valid: false, message: 'Relation must be a valid string under 100 characters' };
  }

  return { valid: true };
};

const validateMedication = (body) => {
  if (!body || typeof body !== 'object') return { valid: false, message: 'Invalid request body' };
  const { medicineName, dosage, scheduledTime, frequency } = body;

  // elderId is intentionally NOT re-validated here — this endpoint sits
  // behind verifyElderOwnership, which already guarantees elderId is a
  // well-formed, owned ObjectId before this function ever runs.
  if (!isNonEmptyString(medicineName, 200)) {
    return { valid: false, message: 'Medicine name is required and must be under 200 characters' };
  }
  if (!isNonEmptyString(dosage, 100)) {
    return { valid: false, message: 'Dosage is required and must be under 100 characters' };
  }
  if (!isValidTimeString(scheduledTime)) {
    return { valid: false, message: 'Scheduled time must be in HH:MM 24-hour format' };
  }
  if (frequency !== undefined && frequency !== 'daily') {
    return { valid: false, message: 'Frequency must be "daily"' };
  }

  return { valid: true };
};

const ALLOWED_ALERT_TYPES = [
  'fraud',
  'confusion',
  'inactivity',
  'unusual_transaction',
  'suspicious_link',
  'medication_missed'
];
const ALLOWED_ALERT_SEVERITIES = ['low', 'medium', 'high'];

const validateAlertCreation = (body) => {
  if (!body || typeof body !== 'object') return { valid: false, message: 'Invalid request body' };
  const { type, severity, message } = body;

  // elderId intentionally not re-validated — verifyElderOwnership already
  // guarantees it's a well-formed, owned ObjectId before this runs.
  if (!ALLOWED_ALERT_TYPES.includes(type)) {
    return { valid: false, message: 'Invalid alert type' };
  }
  if (severity !== undefined && !ALLOWED_ALERT_SEVERITIES.includes(severity)) {
    return { valid: false, message: 'Severity must be one of: low, medium, high' };
  }
  if (!isNonEmptyString(message, 1000)) {
    return { valid: false, message: 'Message is required and must be under 1000 characters' };
  }

  return { valid: true };
};

const validateTransactionAnalysis = (body) => {
  if (!body || typeof body !== 'object') return { valid: false, message: 'Invalid request body' };
  const { amount, recipient, time, description } = body;

  // elderId intentionally not re-validated — verifyElderOwnership already
  // guarantees it's a well-formed, owned ObjectId before this runs.
  if (!isPositiveFiniteNumber(amount)) {
    return { valid: false, message: 'Amount must be a positive number' };
  }
  if (!isNonEmptyString(recipient, 200)) {
    return { valid: false, message: 'Recipient is required and must be under 200 characters' };
  }
  if (!isNonEmptyString(time, 100)) {
    return { valid: false, message: 'Time is required and must be under 100 characters' };
  }
  if (!isNonEmptyString(description, 1000)) {
    return { valid: false, message: 'Description is required and must be under 1000 characters' };
  }

  return { valid: true };
};

module.exports = {
  isValidObjectId,
  isNonEmptyString,
  isValidPhone,
  isValidTimeString,
  isFiniteNumber,
  isPositiveFiniteNumber,
  isValidAge,
  validateFamilyRegistration,
  validateLogin,
  validateElderRegistration,
  validateMedication,
  validateAlertCreation,
  validateTransactionAnalysis,
  ALLOWED_ALERT_TYPES,
  ALLOWED_ALERT_SEVERITIES
};
