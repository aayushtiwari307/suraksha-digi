const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const Family = require('../models/Family');
const { isValidPhone } = require('../utils/validators');

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const hashResetToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

const createTransporter = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    const error = new Error('Password reset email service is not configured');
    error.statusCode = 503;
    throw error;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: String(SMTP_SECURE || '').toLowerCase() === 'true',
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
};

const buildResetUrl = (rawToken) => {
  const frontendUrl = (process.env.FRONTEND_URL || 'https://suraksha-digi-dashboard.vercel.app').replace(/\/+$/, '');
  return `${frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
};

const genericForgotPasswordResponse = (res) => res.status(200).json({
  success: true,
  message: 'If that number is registered, a password reset email has been sent.'
});

const forgotPassword = async (req, res) => {
  try {
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';

    if (!isValidPhone(phone)) {
      // Deliberately keep the same response as a non-existent account so the
      // endpoint does not become a phone-number enumeration oracle.
      return genericForgotPasswordResponse(res);
    }

    const family = await Family.findOne({ phone });

    if (!family || !family.email) {
      return genericForgotPasswordResponse(res);
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    family.passwordResetTokenHash = hashResetToken(rawToken);
    family.passwordResetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await family.save();

    const resetUrl = buildResetUrl(rawToken);
    const transporter = createTransporter();

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: family.email,
      subject: 'SurakshaDigi password reset',
      text: [
        'We received a request to reset your SurakshaDigi password.',
        '',
        `Reset your password here: ${resetUrl}`,
        '',
        'This link expires in 1 hour. If you did not request a reset, you can ignore this email.',
      ].join('\n'),
      html: `<p>We received a request to reset your SurakshaDigi password.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 1 hour. If you did not request a reset, you can ignore this email.</p>`,
    });

    return genericForgotPasswordResponse(res);
  } catch (error) {
    // Never reveal account existence or SMTP internals to the caller.
    console.error(error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: 'Unable to process the password reset request right now.'
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body || {};

    if (typeof token !== 'string' || token.length < 32 ||
        typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'A valid reset token and a password of at least 8 characters are required'
      });
    }

    const tokenHash = hashResetToken(token);
    const family = await Family.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    }).select('+passwordResetTokenHash +passwordResetExpiresAt');

    if (!family) {
      return res.status(400).json({
        success: false,
        message: 'This password reset link is invalid or has expired'
      });
    }

    family.password = await bcrypt.hash(password, 10);
    // One-time token: remove it immediately after a successful reset.
    family.passwordResetTokenHash = null;
    family.passwordResetExpiresAt = null;
    await family.save();

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now sign in with your new password.'
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Unable to reset the password right now'
    });
  }
};

module.exports = {
  forgotPassword,
  resetPassword,
  hashResetToken,
  RESET_TOKEN_TTL_MS,
};
