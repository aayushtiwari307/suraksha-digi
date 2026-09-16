const Transaction = require('../models/Transaction');
const Alert = require('../models/Alert');
const { parseBankSms } = require('../utils/smsParser');
const { getISTDateString } = require('../utils/istTime');
const { parseTransactionSmsWithGemini } = require('../config/gemini');
const { processTransaction, resolveExistingDeviceEvent } = require('../services/fraudService');
const { isValidObjectId, validateSmsIngestion } = require('../utils/validators');

const parseFallbackDateTime = (dateString, timeString, fallbackDate = new Date()) => {
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

  let datePart = dateString;
  if (datePart) {
    const dateMatch = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!dateMatch) return null;
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const year = Number(dateMatch[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const check = new Date(`${candidate}T00:00:00Z`);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return null;
    datePart = candidate;
  }

  const date = datePart || getISTDateString(fallbackDate);
  const result = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:30`);
  return Number.isNaN(result.getTime()) ? null : result;
};

const processIncomingSms = async ({ elderId, rawMessage, source = 'simulation', deviceId = null, eventId = null, receivedAt = new Date(), sender = '' }) => {
  // Fast path for an exact Android event retry: skip re-parsing the SMS.
  // This matters more than it looks — the Gemini fallback below fires
  // whenever the regex parser yields an unknown recipient or unknown
  // transaction type, which is exactly the profile of a scam SMS. Without
  // this early return, every retry of a scam SMS would trigger a fresh
  // Gemini call, and a Gemini outage would turn a harmless duplicate into
  // a 422 error that the phone would then retry again.
  //
  // Crucially, this does NOT re-implement duplicate detection or alert
  // recovery. It delegates to the single shared implementation in
  // fraudService, which also repairs a missing HIGH-risk alert. A previous
  // version of this function had its own parallel copy of that check with
  // a raw `Alert.findOne` and no recovery step, which meant the real
  // Android retry path silently never got the recovery it most needed.
  // Keep exactly one implementation — do not re-inline this logic here.
  if (deviceId && eventId) {
    const existingEvent = await resolveExistingDeviceEvent({ deviceId, eventId });
    if (existingEvent) return { ...existingEvent, parser: 'dedup-event' };
  }

  let parsed = parseBankSms(rawMessage);
  let parser = 'regex';

  if (parsed.success && parsed.data.transactionTimeSource === 'receivedAt') {
    parsed.data.transactionTime = new Date(receivedAt);
  }

  const regexNeedsFallback = parsed.success &&
    (parsed.data.recipient === 'Unknown recipient' || parsed.data.transactionType === 'unknown');

  if (!parsed.success || regexNeedsFallback) {
    const fallback = await parseTransactionSmsWithGemini(rawMessage);
    if (!fallback) {
      const error = new Error('Could not confidently understand this SMS. Try a clearer bank transaction message.');
      error.statusCode = 422;
      error.code = 'SMS_PARSE_FAILED';
      throw error;
    }

    const fallbackDateTime = parseFallbackDateTime(fallback.date, fallback.time, receivedAt);
    parsed = {
      success: true,
      data: {
        rawMessage: rawMessage.trim(),
        amount: fallback.amount,
        recipient: fallback.recipient || (parsed.success ? parsed.data.recipient : 'Unknown recipient'),
        transactionType: fallback.transactionType || (parsed.success ? parsed.data.transactionType : 'unknown'),
        transactionTime: fallbackDateTime || (parsed.success ? parsed.data.transactionTime : new Date(receivedAt)),
        transactionTimeSource: fallbackDateTime ? 'gemini' : (parsed.success ? parsed.data.transactionTimeSource : 'receivedAt'),
        reference: fallback.reference || null,
      },
    };
    parser = 'gemini-fallback';
  }

  return processTransaction({
    elderId,
    ...parsed.data,
    source,
    deviceId,
    eventId,
    sender,
  }).then((result) => ({ ...result, parser }));
};

const ingestSms = async (req, res) => {
  try {
    const validation = validateSmsIngestion(req.body);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const result = await processIncomingSms({
      elderId: req.body.elderId,
      rawMessage: req.body.rawMessage,
      source: 'simulation',
      receivedAt: new Date(),
    });

    return res.status(result.duplicate ? 200 : 201).json({
      success: true,
      message: result.duplicate ? 'This transaction was already processed' : 'SMS processed successfully',
      duplicate: result.duplicate,
      parser: result.parser,
      transaction: result.transaction,
      alert: result.alert,
    });
  } catch (error) {
    console.error(error);
    const status = error.statusCode || 500;
    return res.status(status).json({ success: false, message: status === 500 ? 'Server error' : error.message, ...(error.code ? { code: error.code } : {}) });
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

    return res.status(200).json({ success: true, count: transactions.length, transactions });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { ingestSms, getElderTransactions, processIncomingSms };
