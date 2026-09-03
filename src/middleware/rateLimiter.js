const rateLimit = require('express-rate-limit');

// Applied only to login/register routes, never globally.
// Login and registration share the same limit deliberately: both are
// equally viable automation targets (registration can be used to
// enumerate phone numbers via the "already exists" response just as
// login can be used to guess passwords), so there's no reason to treat
// them differently.
// 10 requests / 15 minutes / IP is generous enough that a real user
// mistyping a password a few times, or a slow/retried connection,
// never gets blocked, while cutting an automated attempt down from
// thousands of tries to a handful per window.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again later.' }
});

module.exports = { authLimiter };
