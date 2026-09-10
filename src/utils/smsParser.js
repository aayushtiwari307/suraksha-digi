const { getISTDateString } = require('./istTime');

const normalizeRecipient = (value) => {
  if (!value) return 'Unknown recipient';
  return value
    .replace(/[.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const extractAmount = (message) => {
  const patterns = [
    /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:debited|credited|spent|paid|transferred)\D{0,25}(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      const amount = Number(match[1].replace(/,/g, ''));
      if (Number.isFinite(amount) && amount > 0) return amount;
    }
  }

  return null;
};

const extractTransactionType = (message) => {
  if (/\b(debited|spent|withdrawn|paid|purchase)\b/i.test(message)) return 'debit';
  if (/\b(credited|received|refund)\b/i.test(message)) return 'credit';
  if (/\b(transferred|transfer|upi)\b/i.test(message)) return 'transfer';
  return 'unknown';
};

const extractRecipient = (message) => {
  const patterns = [
    /\bto\s+(.+?)(?=\s+(?:at|on)\s+(?:\d{1,2}:\d{2}(?:\s*(?:AM|PM))?|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})|\s+(?:via|through|for|using|towards|ref|txn|transaction)\b|[.;\n]|$)/i,
    /(?:beneficiary|payee|merchant)\s*[:=-]\s*([^.;\n]{2,100})/i,
    /\btowards\s+(.+?)(?=\s+(?:at|on)\s+(?:\d{1,2}:\d{2}(?:\s*(?:AM|PM))?|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})|[.;\n]|$)/i,
    /\bfrom\s+(.+?)(?=\s+(?:at|on)\s+(?:\d{1,2}:\d{2}(?:\s*(?:AM|PM))?|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})|\s+(?:via|through|for|using|towards|ref|txn|transaction)\b|[.;\n]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      const recipient = normalizeRecipient(match[1]);
      if (recipient !== 'Unknown recipient') return recipient;
    }
  }

  return 'Unknown recipient';
};

const extractReference = (message) => {
  const match = message.match(/(?:utr|txn(?:\s*no)?|transaction(?:\s*id)?|ref(?:erence)?(?:\s*no)?)\s*[:#-]?\s*([A-Za-z0-9-]{6,40})/i);
  return match ? match[1] : null;
};

const extractTime = (message) => {
  const match = message.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)?\b/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3]?.toUpperCase();

  if (period) {
    if (hours < 1 || hours > 12 || minutes > 59) return null;
    hours %= 12;
    if (period === 'PM') hours += 12;
  } else if (hours > 23 || minutes > 59) {
    return null;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const extractDate = (message) => {
  const slash = message.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (!slash) return null;

  let day = Number(slash[1]);
  let month = Number(slash[2]);
  let year = Number(slash[3]);
  if (year < 100) year += 2000;

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const check = new Date(`${candidate}T00:00:00Z`);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) return null;

  return candidate;
};

const toActualDate = (dateString, timeString) => {
  const date = dateString || getISTDateString();
  const time = timeString || new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const iso = `${date}T${time}:00+05:30`;
  const result = new Date(iso);
  return Number.isNaN(result.getTime()) ? new Date() : result;
};

const parseBankSms = (rawMessage) => {
  if (typeof rawMessage !== 'string' || rawMessage.trim().length === 0) {
    return { success: false, reason: 'SMS message is empty' };
  }

  const message = rawMessage.trim();
  const amount = extractAmount(message);
  if (!amount) {
    return { success: false, reason: 'Could not confidently extract a transaction amount' };
  }

  const time = extractTime(message);
  const date = extractDate(message);
  const transactionType = extractTransactionType(message);
  const recipient = extractRecipient(message);
  const reference = extractReference(message);

  return {
    success: true,
    data: {
      rawMessage: message,
      amount,
      recipient,
      transactionType,
      transactionTime: toActualDate(date, time),
      transactionTimeSource: date || time ? 'sms' : 'receivedAt',
      reference,
    },
  };
};

module.exports = {
  parseBankSms,
  normalizeRecipient,
  extractAmount,
  extractTransactionType,
  extractRecipient,
  extractReference,
  extractTime,
  extractDate,
};
