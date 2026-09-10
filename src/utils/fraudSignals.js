const { normalizeRecipient } = require('./smsParser');

const getISTHour = (date) => Number(new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  hour12: false,
  hourCycle: 'h23',
}).format(date));

const SCAM_KEYWORDS = [
  'kyc',
  'otp',
  'account blocked',
  'account will be blocked',
  'refund',
  'urgent verification',
  'verify account',
  'lottery',
  'prize',
  'claim prize',
  'share otp',
];

const TRANSACTION_HISTORY_LIMIT = 100;
const VELOCITY_WINDOW_MINUTES = 10;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const findMatchedKeywords = (message) => {
  const lower = message.toLowerCase();
  return SCAM_KEYWORDS.filter(keyword => lower.includes(keyword));
};

const calculateAmountSignal = (amount, history) => {
  const amounts = history
    .filter(tx => ['debit', 'transfer', 'unknown'].includes(tx.transactionType || 'unknown'))
    .map(tx => tx.amount)
    .filter(Number.isFinite);

  if (amounts.length === 0) {
    return {
      unusualAmount: amount >= 10000,
      deviationRatio: 0,
      averageAmount: 0,
    };
  }

  const averageAmount = amounts.reduce((sum, value) => sum + value, 0) / amounts.length;
  const deviationRatio = averageAmount > 0 ? amount / averageAmount : 0;
  const unusualAmount = deviationRatio >= 2.5 || (amount - averageAmount >= 5000 && deviationRatio >= 1.75);

  return {
    unusualAmount,
    deviationRatio: Number(deviationRatio.toFixed(2)),
    averageAmount: Number(averageAmount.toFixed(2)),
  };
};

const calculateTimeSignal = (transactionTime, history) => {
  const hour = getISTHour(transactionTime);
  const genericUnusual = hour < 6 || hour >= 23;

  if (history.length < 3) {
    return genericUnusual;
  }

  const historicalHours = history
    .map(tx => tx.transactionTime ? getISTHour(tx.transactionTime) : null)
    .filter(hourValue => Number.isInteger(hourValue));

  if (historicalHours.length < 3) return genericUnusual;

  const minHour = Math.min(...historicalHours);
  const maxHour = Math.max(...historicalHours);
  return genericUnusual || hour < minHour - 1 || hour > maxHour + 1;
};

const calculateVelocity = (transactionTime, history) => {
  const windowStart = transactionTime.getTime() - VELOCITY_WINDOW_MINUTES * 60 * 1000;
  return history.filter(tx => {
    const time = tx.transactionTime?.getTime?.();
    return Number.isFinite(time) && time >= windowStart && time <= transactionTime.getTime();
  }).length + 1 >= 3;
};

const calculateFraudSignals = ({ amount, recipient, transactionType = 'unknown', rawMessage, transactionTime, history }) => {
  const safeHistory = Array.isArray(history) ? history.slice(0, TRANSACTION_HISTORY_LIMIT) : [];
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

  const riskScore = clamp(scoreParts.reduce((sum, [, points]) => sum + points, 0), 0, 100);
  const riskLevel = riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low';

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
      recentTransactionCount: safeHistory.filter(tx => {
        const txTime = tx.transactionTime?.getTime?.();
        return Number.isFinite(txTime) && txTime >= transactionTime.getTime() - VELOCITY_WINDOW_MINUTES * 60 * 1000;
      }).length + 1,
      matchedKeywords,
      reasonCodes,
    },
    riskScore,
    riskLevel,
  };
};

module.exports = {
  calculateFraudSignals,
  SCAM_KEYWORDS,
  VELOCITY_WINDOW_MINUTES,
};
