const Transaction = require('../models/Transaction');
const { parseBankSms } = require('../utils/smsParser');
const { getISTDateString } = require('../utils/istTime');
const { parseTransactionSmsWithGemini } = require('../config/gemini');
const { processTransaction } = require('../services/fraudService');
const { isValidObjectId, validateSmsIngestion } = require('../utils/validators');

const parseFallbackDateTime = (dateString, timeString) => {
  if (!timeString) return null;
  const timeMatch = timeString.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!timeMatch) return null;

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const period = timeMatch[3]?.toUpperCase();
  if (minute > 59) return null;

  if (period) {
    if (hour < 1 || hour > 12) return null;
    hour %= 12;
    if (period === 'PM') hour += 12;
  } else if (hour > 23) {
    return null;
  }

  const date = dateString && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateString)
    ? (() => {
      const [day, month, year] = dateString.split('/').map(Number);
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    })()
    : null;

  const today = getISTDateString();
  const datePart = date || today;
  const result = new Date(`${datePart}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:30`);
  return Number.isNaN(result.getTime()) ? null : result;
};

const ingestSms = async (req, res) => {
  try {
    const validation = validateSmsIngestion(req.body);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const { elderId, rawMessage } = req.body;
    let parsed = parseBankSms(rawMessage);
    let parser = 'regex';

    // Regex is the default path. If it parsed the amount but left the
    // recipient/type unknown, let Gemini fill only the missing structure.
    const regexNeedsFallback = parsed.success &&
      (parsed.data.recipient === 'Unknown recipient' || parsed.data.transactionType === 'unknown');

    if (!parsed.success || regexNeedsFallback) {
      const fallback = await parseTransactionSmsWithGemini(rawMessage);
      if (!fallback) {
        return res.status(422).json({
          success: false,
          message: 'Could not confidently understand this SMS. Try a clearer bank transaction message.',
          code: 'SMS_PARSE_FAILED',
        });
      }

      const fallbackDateTime = parseFallbackDateTime(fallback.date, fallback.time);
      parsed = {
        success: true,
        data: {
          rawMessage: rawMessage.trim(),
          amount: fallback.amount,
          recipient: fallback.recipient || (parsed.success ? parsed.data.recipient : 'Unknown recipient'),
          transactionType: fallback.transactionType || (parsed.success ? parsed.data.transactionType : 'unknown'),
          transactionTime: fallbackDateTime || (parsed.success ? parsed.data.transactionTime : new Date()),
          transactionTimeSource: fallbackDateTime ? 'gemini' : (parsed.success ? parsed.data.transactionTimeSource : 'receivedAt'),
          reference: null,
        },
      };
      parser = 'gemini-fallback';
    }

    const result = await processTransaction({
      elderId,
      ...parsed.data,
    });

    return res.status(result.duplicate ? 200 : 201).json({
      success: true,
      message: result.duplicate ? 'This transaction was already processed' : 'SMS processed successfully',
      duplicate: result.duplicate,
      parser,
      transaction: result.transaction,
      alert: result.alert,
    });
  } catch (error) {
    console.error(error);
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: status === 500 ? 'Server error' : error.message,
    });
  }
};

const getElderTransactions = async (req, res) => {
  try {
    const { elderId } = req.params;
    if (!isValidObjectId(elderId)) {
      return res.status(400).json({ success: false, message: 'Invalid elder ID' });
    }

    const requestedLimit = Number(req.query.limit || 20);
    const limit = Number.isFinite(requestedLimit) ? Math.min(50, Math.max(1, Math.floor(requestedLimit))) : 20;

    const transactions = await Transaction.find({ elderId })
      .sort({ transactionTime: -1 })
      .limit(limit);

    return res.status(200).json({
      success: true,
      count: transactions.length,
      transactions,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  ingestSms,
  getElderTransactions,
};
