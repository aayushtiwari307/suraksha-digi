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

// A transfer-target "to" is followed by a name, VPA, or merchant
// ("sent to Ramesh Kumar", "to unknown@ybl"). An instructional/infinitive
// "to" is followed by a verb telling the reader to do something
// ("click here TO VERIFY", "share OTP TO REVERSE this debit") — extremely
// common in scam SMS, which usually has no real transfer target at all.
// The original regex had no way to tell these apart and would happily
// store "reverse this debit" or "verify your account now" as if it were
// the recipient. This list is deliberately scam-CTA-focused rather than
// exhaustive — a real merchant name starting with one of these words is
// implausible in this domain (Indian bank/UPI SMS), but a scam phrasing
// using a verb outside this list could still slip through. That residual
// gap is accepted per the fix's scope: falling through to
// 'Unknown recipient' is the acceptable outcome, not silence.
const INSTRUCTIONAL_VERBS = new Set([
  'verify', 'reverse', 'reactivate', 'confirm', 'claim', 'activate', 'avoid',
  'block', 'unblock', 'unlock', 'continue', 'proceed', 'cancel', 'stop',
  'secure', 'protect', 'restore', 'complete', 'update', 'renew', 'submit',
  'provide', 'share', 'click', 'call', 'contact', 'register', 'download',
  'install', 'authorize', 'validate', 'redeem', 'enter', 'open', 'tap',
  'visit', 'login', 'log', 'access', 'receive', 'collect', 'prevent',
  'resolve', 'fix', 'keep', 'stay', 'get', 'obtain', 'remove', 'delete',
  'lose', 'ensure', 'follow', 'pay',
]);

const looksInstructional = (candidate) => {
  const trimmed = candidate.trim();
  const words = trimmed.split(/\s+/);
  const firstWord = words[0]?.toLowerCase().replace(/[^a-z]/g, '');
  if (firstWord && INSTRUCTIONAL_VERBS.has(firstWord)) return true;

  // A real recipient (name, merchant, VPA) is short. A long run of words
  // with no VPA-shaped token is almost always a captured sentence fragment,
  // not a name — even when it doesn't happen to start with one of the verbs
  // above. This catches constructions the verb-first-word check alone
  // can't, such as "due to a security update please share OTP ... to
  // verify your account now": that candidate starts with "a", not a verb,
  // because "due to" (not "to verify") is the "to" that actually matched —
  // but no genuine recipient in this domain runs to 7+ words.
  const looksLikeVpa = /\S+@\S+/.test(trimmed);
  if (!looksLikeVpa && words.length > 6) return true;

  return false;
};

// Round 2 of this fix. Round 1 (see CLAUDE_PATCH_NOTES_RECIPIENT_FIX.md)
// correctly rejected the *specific* scam-CTA strings from the original bug
// report, but it only asked "does this start with an instruction verb, or
// is it implausibly long?" — it never asked "does this actually look like a
// recipient?" So short non-verb fragments like "KBC lottery processing fee",
// "your account", and "KYC expiry" (pulled from elsewhere in the sentence
// once the CTA verb itself was rejected) slipped through both checks above
// and were returned as if they were real recipients. Same bug as round 1,
// different phrasing, because the underlying rule was still whack-a-mole
// rather than structural.
//
// The actual rule (per spec): a plausible recipient is shaped like one of —
//   - a VPA: contains '@'. Checked first and unconditionally, since VPA
//     handles/local-parts are conventionally lowercase and would otherwise
//     fail the capitalization check below (e.g. "unknown@ybl").
//   - a name or merchant token: every word is either a small closed set of
//     lowercase connector words ("of", "the", "and", "for", "at", "de",
//     "la" — so "Bank of India" isn't rejected for the lowercase "of"), or
//     starts with a capital letter and otherwise contains only letters,
//     apostrophes, ampersands, periods or hyphens (covers "Priya Sharma",
//     "AMAZON PAY", "O'Brien", "M&S", "A.K. Sharma"). At least one word must
//     satisfy the capitalized case — a candidate made entirely of connector
//     words is not a name.
// Anything else — a lowercase noun phrase, a fragment containing digits or
// a slash (an account number like "A/c XX1234" is NOT name-shaped, and can
// otherwise slip through once an instructional match ahead of it is
// rejected and the loop falls back to an earlier "from" clause), a mixed
// lowercase phrase like "KBC lottery processing fee" — is rejected in favor
// of the 'Unknown recipient' fallback, exactly as already happens for scam
// CTAs caught by the checks above.
//
// Deliberately NOT hard-coded to the three garbage strings from the bug
// report: this is a shape test, so any future scam phrasing that isn't
// name/VPA/merchant-shaped is rejected the same way, without needing a new
// exclusion added per incident.
const RECIPIENT_CONNECTOR_WORDS = new Set(['of', 'the', 'and', 'for', 'at', 'de', 'la']);
const RECIPIENT_NAME_WORD = /^[A-Z][A-Za-z'&.-]*$/;

const looksLikeRecipient = (candidate) => {
  const trimmed = candidate.trim();
  if (!trimmed) return false;

  if (/\S+@\S+/.test(trimmed)) return true;

  const words = trimmed.split(/\s+/);
  let hasCapitalizedWord = false;

  for (const word of words) {
    // Strip punctuation only from the edges of the token (trailing comma,
    // wrapping quotes, etc.) — NOT from the middle. A mid-token stray
    // character (the '/' in "A/c", a digit in "XX1234") must stay so the
    // shape check below can see it and reject the token; stripping it away
    // would let account numbers and other non-name tokens masquerade as
    // capitalized words.
    const core = word.replace(/^[,.;:!?()"'&-]+/, '').replace(/[,.;:!?()"'&-]+$/, '');
    if (!core) continue; // pure punctuation token, e.g. a stray "-" or ","

    if (RECIPIENT_CONNECTOR_WORDS.has(core.toLowerCase())) continue;

    if (!RECIPIENT_NAME_WORD.test(core)) return false;
    hasCapitalizedWord = true;
  }

  return hasCapitalizedWord;
};

// The stop condition below treats a bare '.' as a sentence boundary, which
// is right for "...to Ramesh Kumar. Avl Bal..." but wrong for a VPA whose
// local part contains a dot ("ramesh.kirana@okaxis") — the original pattern
// stopped at the FIRST dot it found, truncating the capture to "ramesh" and
// silently dropping ".kirana@okaxis" (a pre-existing bug, unrelated to the
// instructional-"to" issue, found while testing the VPA regression case).
// Only treat '.' as a boundary when it's not immediately followed by a
// word character, so a mid-token dot no longer ends the match early.
const SENTENCE_END = '(?:[;\\n]|\\.(?!\\w))';

const extractRecipient = (message) => {
  // Global ('g') versions of the original patterns: a message can contain
  // more than one "to"/"towards"/"from" occurrence (an instructional one
  // and a genuine transfer target, in either order), so every occurrence
  // is checked in turn rather than only the first.
  const patterns = [
    new RegExp(`\\bto\\s+(.+?)(?=\\s+(?:at|on)\\s+(?:\\d{1,2}:\\d{2}(?:\\s*(?:AM|PM))?|\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})|\\s+(?:via|through|for|using|towards|ref|txn|transaction)\\b|${SENTENCE_END}|$)`, 'gi'),
    new RegExp(`(?:beneficiary|payee|merchant)\\s*[:=-]\\s*(.+?)(?=${SENTENCE_END}|$)`, 'gi'),
    new RegExp(`\\btowards\\s+(.+?)(?=\\s+(?:at|on)\\s+(?:\\d{1,2}:\\d{2}(?:\\s*(?:AM|PM))?|\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})|${SENTENCE_END}|$)`, 'gi'),
    new RegExp(`\\bfrom\\s+(.+?)(?=\\s+(?:at|on)\\s+(?:\\d{1,2}:\\d{2}(?:\\s*(?:AM|PM))?|\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})|\\s+(?:via|through|for|using|towards|ref|txn|transaction)\\b|${SENTENCE_END}|$)`, 'gi'),
  ];

  for (const pattern of patterns) {
    for (const match of message.matchAll(pattern)) {
      if (looksInstructional(match[1])) continue;
      if (!looksLikeRecipient(match[1])) continue;
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
