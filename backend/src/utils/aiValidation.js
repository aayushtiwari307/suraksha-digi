// Validates the shape Gemini is asked to return for fraud analysis.
// Treats the model's output as untrusted: never throws, never guesses,
// and only ever returns a value built entirely from the whitelisted
// fields below — nothing from the input object is passed through as-is.
const ALLOWED_RISK_LEVELS = ['low', 'medium', 'high'];

const validateFraudAnalysis = (obj) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false };
  }

  if (typeof obj.riskLevel !== 'string') {
    return { valid: false };
  }
  const riskLevel = obj.riskLevel.trim().toLowerCase();
  if (!ALLOWED_RISK_LEVELS.includes(riskLevel)) {
    return { valid: false };
  }

  if (typeof obj.reason !== 'string' || obj.reason.trim().length === 0) {
    return { valid: false };
  }
  const reason = obj.reason.trim();

  // Any other field on obj (e.g. "recommendation", or anything unexpected
  // the model added) is intentionally dropped — it is never read from here.
  return { valid: true, data: { riskLevel, reason } };
};

module.exports = { validateFraudAnalysis, ALLOWED_RISK_LEVELS };
