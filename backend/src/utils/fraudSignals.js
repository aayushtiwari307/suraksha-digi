const { normalizeRecipient } = require('./smsParser');

const getISTHour = (date) => Number(new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  hour12: false,
  hourCycle: 'h23',
}).format(date));

// 'otp to verify'/'otp required to verify' were deliberately removed here.
// That exact phrasing ("<code> is your OTP to verify <X>") is how legitimate
// banks phrase a normal, benign OTP-delivery message — it isn't a reliable
// scam signal on its own, and no scam test case in this suite depended on it
// (every scam case is caught by an actual instruction/threat pattern below).
const SCAM_PATTERNS = [
  { label: 'share otp', pattern: /\bshare\s+(?:the\s+|your\s+)?otp\b/i },
  { label: 'send otp to', pattern: /\bsend\s+(?:the\s+|your\s+)?otp\s+to\b/i },
  { label: 'click link to verify', pattern: /\bclick\s+(?:this|the)\s+(?:link|url)\s+to\s+verify\b/i },
  { label: 'account blocked threat', pattern: /\b(?:your\s+)?account\s+will\s+be\s+blocked\s+(?:unless|if|within|today|immediately)\b/i },
  { label: 'blocked account instruction', pattern: /\baccount\s+(?:is\s+)?blocked\s*[-:]?\s*(?:verify|click|call|send|share)\b/i },
  { label: 'urgent kyc verification', pattern: /\burgent\s+(?:kyc\s+)?verification\s+(?:required|needed|pending)\b/i },
  { label: 'immediate kyc verification', pattern: /\b(?:complete|finish|do)\s+kyc\s+verification\s+(?:immediately|urgently|now)\b/i },
  { label: 'remote access', pattern: /\bremote\s+access\b/i },
  { label: 'screen share', pattern: /\bscreen\s*share\b|\bscreen\s+sharing\b/i },
  { label: 'prize or lottery claim', pattern: /\b(?:claim|collect)\s+(?:your\s+)?(?:prize|lottery\s+winnings?)\b|\byou\s+(?:have|won)\s+(?:won\s+)?(?:a\s+)?(?:prize|lottery)\b/i },
];

const TRANSACTION_HISTORY_LIMIT = 100;
const VELOCITY_WINDOW_MINUTES = 10;
const AMOUNT_HISTORY_MIN = 5;
const TIME_HISTORY_MIN = 8;
const UNUSUAL_AMOUNT_FLOOR = 500;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// 'share the OTP' / 'send OTP to' / 'remote access' / 'screen share' are
// genuine scam instructions when the message is telling the reader to hand
// something over — but the exact same words appear, negated, in standard
// anti-phishing warnings every real bank and antivirus vendor sends
// ('Do NOT share your OTP with anyone', 'never give remote access to
// anyone claiming to be bank staff', 'do not share your screen with
// callers'). For just these patterns, check a short window of text
// immediately before the match for a negation word, and don't count it as
// scam evidence if one is found.
const NEGATION_SENSITIVE_LABELS = new Set(['share otp', 'send otp to', 'remote access', 'screen share']);
// Broad on purpose: matching bare "not" (rather than only the phrase "do
// not") also catches "advised NOT to share", "should NOT share", "will NOT
// ask you to share", etc. A short SMS asking a victim to hand over an OTP
// essentially never contains an unrelated "not" in the few words right
// before the instruction, so this trade-off favors not missing a real
// disclaimer over the small risk of a coincidental nearby "not".
const NEGATION_WORDS = /\b(?:not|never|don'?t|won'?t|wont|avoid)\b/i;
// A fixed character count breaks on compound warnings that list more than
// one action after a single negation ("do not share your screen OR provide
// remote access to anyone") — the second clause can sit well past a short
// window even though it's clearly still covered by the same "do not".
// Scoping the lookback to the current sentence (from the last '.', '!', '?'
// or newline up to the match) handles that without having to guess a
// magic distance. SMS bodies are short, so this rarely spans more than a
// clause or two in practice; NEGATION_LOOKBACK_MAX_CHARS is just a sanity
// ceiling for pathological single-sentence input.
const SENTENCE_BOUNDARY = /[.!?\n]/;
// A negation only covers the clause it belongs to. A message can reassure
// first and then pivot to the real demand inside the same sentence
// ("We will never call and ask for your OTP, BUT you must share your OTP
// now to avoid suspension") — scanning back to the start of the sentence
// would find "never" and wrongly suppress a genuine scam instruction.
// Resetting the scope at a contrastive word fixes that.
//
// 'or' is deliberately NOT a pivot word: "do not share your screen OR
// provide remote access" is one continuous negated list, and treating
// 'or' as a reset would reintroduce the compound-warning false positive
// this scope-widening was built to fix in the first place.
const NEGATION_SCOPE_RESET = /\b(?:but|however|although|though|except|yet|instead)\b/i;
const NEGATION_LOOKBACK_MAX_CHARS = 200;

// Whether a specific occurrence of a pattern (at matchIndex) sits inside a
// negated clause.
const isNegatedOccurrence = (text, matchIndex) => {
  let scopeStart = Math.max(0, matchIndex - NEGATION_LOOKBACK_MAX_CHARS);
  for (let i = matchIndex - 1; i >= scopeStart; i--) {
    if (SENTENCE_BOUNDARY.test(text[i])) {
      scopeStart = i + 1;
      break;
    }
  }

  let precedingText = text.slice(scopeStart, matchIndex);

  // Trim everything up to and including the last contrastive pivot, so only
  // the clause actually containing this occurrence is examined.
  const pivotMatches = [...precedingText.matchAll(new RegExp(NEGATION_SCOPE_RESET.source, 'gi'))];
  if (pivotMatches.length > 0) {
    const lastPivot = pivotMatches[pivotMatches.length - 1];
    precedingText = precedingText.slice(lastPivot.index + lastPivot[0].length);
  }

  return NEGATION_WORDS.test(precedingText);
};

const findMatchedKeywords = (message = '') => {
  const text = String(message);
  const matched = [];

  for (const { label, pattern } of SCAM_PATTERNS) {
    if (!NEGATION_SENSITIVE_LABELS.has(label)) {
      if (pattern.test(text)) matched.push(label);
      continue;
    }

    // Check EVERY occurrence, not just the first. A message can disclaim the
    // action once and then demand it later ("we never request remote access,
    // however you must provide remote access immediately") — testing only the
    // first match would find the negated one, skip the whole pattern, and
    // miss the actual instruction. The pattern counts if ANY occurrence of it
    // is un-negated.
    const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    const occurrences = [...text.matchAll(globalPattern)];

    if (occurrences.some((occurrence) => !isNegatedOccurrence(text, occurrence.index))) {
      matched.push(label);
    }
  }

  return matched;
};

const getSpendingAmounts = (history) => history
  .filter(tx => ['debit', 'transfer', 'unknown'].includes(tx.transactionType || 'unknown'))
  .map(tx => tx.amount)
  .filter(Number.isFinite);

const calculateAmountSignal = (amount, history) => {
  const amounts = getSpendingAmounts(history);

  if (amount < UNUSUAL_AMOUNT_FLOOR) {
    return {
      unusualAmount: false,
      deviationRatio: 0,
      averageAmount: amounts.length
        ? Number((amounts.reduce((sum, value) => sum + value, 0) / amounts.length).toFixed(2))
        : 0,
    };
  }

  // Cold-start protection: don't trust a ratio built from fewer than five
  // real spending transactions. Keep the existing flat-amount fallback.
  if (amounts.length < AMOUNT_HISTORY_MIN) {
    return {
      unusualAmount: amount >= 10000,
      deviationRatio: 0,
      averageAmount: amounts.length
        ? Number((amounts.reduce((sum, value) => sum + value, 0) / amounts.length).toFixed(2))
        : 0,
    };
  }

  const averageAmount = amounts.reduce((sum, value) => sum + value, 0) / amounts.length;
  const deviationRatio = averageAmount > 0 ? amount / averageAmount : 0;
  const unusualAmount = deviationRatio >= 2.5 ||
    (amount - averageAmount >= 5000 && deviationRatio >= 1.75);

  return {
    unusualAmount,
    deviationRatio: Number(deviationRatio.toFixed(2)),
    averageAmount: Number(averageAmount.toFixed(2)),
  };
};

const calculateTimeSignal = (transactionTime, history) => {
  const hour = getISTHour(transactionTime);
  const genericUnusual = hour < 6 || hour >= 23;

  const historicalHours = history
    .filter(tx => tx.transactionTime)
    .map(tx => {
      try {
        return getISTHour(tx.transactionTime);
      } catch {
        return null;
      }
    })
    .filter(hourValue => Number.isInteger(hourValue));

  // With eight+ valid timestamps, the elder's established range is the
  // primary signal. Generic clock-time rules must not be added on top.
  if (historicalHours.length >= TIME_HISTORY_MIN) {
    const minHour = Math.min(...historicalHours);
    const maxHour = Math.max(...historicalHours);
    return hour < minHour - 1 || hour > maxHour + 1;
  }

  // Before there is enough timestamped history to learn a personal pattern,
  // retain the original generic fallback.
  return genericUnusual;
};

// Single source of truth for "how many history rows fall in the velocity
// window ending at this transaction". Both highVelocity and the displayed
// recentTransactionCount call this so they can never disagree — previously
// each re-implemented the window filter separately, and only one of the two
// enforced the upper bound (time <= transactionTime), so a history row
// timestamped after the current transaction could inflate the displayed
// count without affecting the actual highVelocity decision.
const countRecentHistory = (transactionTime, history) => {
  const windowStart = transactionTime.getTime() - VELOCITY_WINDOW_MINUTES * 60 * 1000;
  const nowMs = transactionTime.getTime();
  return history.filter(tx => {
    const time = tx.transactionTime?.getTime?.();
    return Number.isFinite(time) && time >= windowStart && time <= nowMs;
  }).length;
};

const calculateVelocity = (transactionTime, history) =>
  countRecentHistory(transactionTime, history) + 1 >= 3;

const calculateFraudSignals = ({
  amount,
  recipient,
  transactionType = 'unknown',
  rawMessage = '',
  transactionTime,
  history,
}) => {
  const safeHistory = Array.isArray(history)
    ? history.slice(0, TRANSACTION_HISTORY_LIMIT)
    : [];

  const normalizedRecipient = normalizeRecipient(recipient).toLowerCase();

  const knownRecipients = new Set(
    safeHistory
      .map(tx => normalizeRecipient(tx.recipient).toLowerCase())
      .filter(Boolean)
  );

  const isSpendingTransaction = ['debit', 'transfer', 'unknown'].includes(transactionType);
  const newRecipient = !isSpendingTransaction || normalizedRecipient === 'unknown recipient'
    ? false
    : !knownRecipients.has(normalizedRecipient);

  const amountSignal = calculateAmountSignal(amount, safeHistory);
  const unusualTime = calculateTimeSignal(transactionTime, safeHistory);
  const highVelocity = calculateVelocity(transactionTime, safeHistory);
  const matchedKeywords = findMatchedKeywords(rawMessage);
  const scamKeyword = matchedKeywords.length > 0;

  const scoreParts = [];
  if (newRecipient) scoreParts.push(['newRecipient', 25]);
  if (amountSignal.unusualAmount) scoreParts.push(['unusualAmount', 25]);
  if (unusualTime) scoreParts.push(['unusualTime', 15]);
  if (highVelocity) scoreParts.push(['highVelocity', 20]);
  if (scamKeyword) scoreParts.push(['scamKeyword', 25]);

  const additiveRiskScore = clamp(
    scoreParts.reduce((sum, [, points]) => sum + points, 0),
    0,
    100
  );

  const realTransactionCount = safeHistory.length;
  const confidenceTier = realTransactionCount < 5
    ? 'low'
    : realTransactionCount < 10
      ? 'partial'
      : 'full';

  const behavioralSignals = newRecipient || amountSignal.unusualAmount || unusualTime || highVelocity;
  const hardSignalPresent = amountSignal.unusualAmount || highVelocity || scamKeyword;

  // This is the only content-evidence exception to the normal >=60 threshold:
  // an explicit scam instruction/threat is hard evidence even with zero history.
  // The five signals retain their original point values; we only prevent a
  // genuine scam message from being stuck at MEDIUM on the first transaction.
  const riskScore = scamKeyword && additiveRiskScore < 60
    ? 60
    : additiveRiskScore;

  let riskLevel = riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low';

  // Statistical/behavioral signals need history before they may create HIGH.
  // Scam-keyword content is deliberately exempt from this cold-start cap.
  if (riskLevel === 'high' && confidenceTier === 'low' && !scamKeyword && behavioralSignals) {
    riskLevel = 'medium';
  }

  // A HIGH score made only from soft/circumstantial signals is capped at MEDIUM.
  if (riskLevel === 'high' && !hardSignalPresent) {
    riskLevel = 'medium';
  }

  const reasonCodes = scoreParts.map(([code]) => code);

  return {
    signals: {
      newRecipient,
      unusualAmount: amountSignal.unusualAmount,
      unusualTime,
      highVelocity,
      scamKeyword,
      amountDeviationRatio: amountSignal.deviationRatio,
      historicalAverageAmount: amountSignal.averageAmount,
      recentTransactionCount: countRecentHistory(transactionTime, safeHistory) + 1,
      transactionCount: realTransactionCount,
      confidenceTier,
      matchedKeywords,
      reasonCodes,
    },
    riskScore,
    riskLevel,
  };
};

module.exports = {
  calculateFraudSignals,
  SCAM_PATTERNS,
  VELOCITY_WINDOW_MINUTES,
};
