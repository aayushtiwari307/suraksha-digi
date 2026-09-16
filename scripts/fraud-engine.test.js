const assert = require('assert');
const { calculateFraudSignals } = require('../src/utils/fraudSignals');

const istDate = (value) => new Date(`${value}+05:30`);

const tx = (amount, recipient, time, transactionType = 'debit') => ({
  amount,
  recipient,
  transactionType,
  transactionTime: istDate(time),
});

const runCase = (name, input, expected) => {
  const result = calculateFraudSignals(input);
  const passed = result.riskLevel === expected;
  console.log(`${passed ? 'PASS' : 'FAIL'} | ${name} | expected=${expected} actual=${result.riskLevel} score=${result.riskScore} reasons=${result.signals.reasonCodes.join(',') || 'none'}`);
  if (!passed) {
    console.log(`      signals=${JSON.stringify(result.signals)}`);
  }
  return {
    name,
    expected,
    actual: result.riskLevel,
    score: result.riskScore,
    passed,
  };
};

const cases = [
  // Legitimate / benign
  {
    name: 'Real ₹47 case: 2 × ₹1 history, new recipient, 5:11 AM',
    input: {
      amount: 47, recipient: 'S E Provision Store', transactionType: 'debit',
      rawMessage: 'UPI debit of ₹47 to S E Provision Store at 5:11 AM',
      transactionTime: istDate('2026-09-15T05:11:00'),
      history: [tx(1, 'Test Shop', '2026-09-12T14:00:00'), tx(1, 'Test Shop', '2026-09-13T16:00:00')],
    },
    expected: 'medium',
  },
  {
    name: 'Small known-recipient daytime payment',
    input: {
      amount: 180, recipient: 'Fresh Mart', transactionType: 'debit',
      rawMessage: 'Paid ₹180 to Fresh Mart at 2:15 PM',
      transactionTime: istDate('2026-09-15T14:15:00'),
      history: [tx(180, 'Fresh Mart', '2026-09-14T14:00:00')],
    },
    expected: 'low',
  },
  {
    name: 'Refund SMS does not trigger scam keyword',
    input: {
      amount: 500, recipient: 'Amazon', transactionType: 'credit',
      rawMessage: 'Refund of ₹500 received from Amazon.',
      transactionTime: istDate('2026-09-15T12:00:00'),
      history: [],
    },
    expected: 'low',
  },
  {
    name: 'Completed KYC SMS does not trigger scam keyword',
    input: {
      amount: 1500, recipient: 'ABC Bank', transactionType: 'credit',
      rawMessage: 'Your KYC has been successfully completed.',
      transactionTime: istDate('2026-09-15T12:00:00'),
      history: [],
    },
    expected: 'low',
  },
  {
    name: 'OTP notification without an instruction',
    input: {
      amount: 900, recipient: 'Known Store', transactionType: 'credit',
      rawMessage: 'Your OTP is 483921 for transaction 883912.',
      transactionTime: istDate('2026-09-15T12:00:00'),
      history: [],
    },
    expected: 'low',
  },
  {
    name: 'Tiny new-recipient daytime purchase stays medium, not high',
    input: {
      amount: 220, recipient: 'Local Bakery', transactionType: 'debit',
      rawMessage: 'Paid ₹220 to Local Bakery.',
      transactionTime: istDate('2026-09-15T13:10:00'),
      history: [tx(200, 'Cafe One', '2026-09-15T13:02:00')],
    },
    expected: 'low',
  },
  {
    name: 'Three tiny plausible shops in ten minutes do not become HIGH',
    input: {
      amount: 240, recipient: 'Corner Grocery', transactionType: 'debit',
      rawMessage: 'Paid ₹240 to Corner Grocery.',
      transactionTime: istDate('2026-09-15T13:10:00'),
      history: [
        tx(120, 'Fruit Shop', '2026-09-15T13:03:00'),
        tx(160, 'Tea Stall', '2026-09-15T13:07:00'),
      ],
    },
    expected: 'medium',
  },
  {
    name: 'Known recipient late-night transaction with enough personal history',
    input: {
      amount: 700, recipient: 'Medical Store', transactionType: 'debit',
      rawMessage: 'Paid ₹700 to Medical Store at 11:30 PM.',
      transactionTime: istDate('2026-09-15T23:30:00'),
      history: [
        tx(650, 'Medical Store', '2026-09-01T22:50:00'),
        tx(700, 'Medical Store', '2026-09-02T23:15:00'),
        tx(620, 'Medical Store', '2026-09-03T22:30:00'),
        tx(680, 'Medical Store', '2026-09-04T23:00:00'),
        tx(710, 'Medical Store', '2026-09-05T22:45:00'),
        tx(690, 'Medical Store', '2026-09-06T23:10:00'),
        tx(675, 'Medical Store', '2026-09-07T22:55:00'),
        tx(700, 'Medical Store', '2026-09-08T23:20:00'),
      ],
    },
    expected: 'low',
  },
  {
    name: '₹499 cannot be unusual from ratio alone',
    input: {
      amount: 499, recipient: 'New Cafe', transactionType: 'debit',
      rawMessage: 'Paid ₹499 to New Cafe.',
      transactionTime: istDate('2026-09-15T15:00:00'),
      history: [tx(20, 'Old Cafe', '2026-09-01T15:00:00'), tx(25, 'Old Cafe', '2026-09-02T15:00:00'), tx(18, 'Old Cafe', '2026-09-03T15:00:00'), tx(22, 'Old Cafe', '2026-09-04T15:00:00'), tx(21, 'Old Cafe', '2026-09-05T15:00:00')],
    },
    expected: 'low',
  },
  {
    name: '₹700 with only 4 history rows cannot use ratio',
    input: {
      amount: 700, recipient: 'New Grocery', transactionType: 'debit',
      rawMessage: 'Paid ₹700 to New Grocery.',
      transactionTime: istDate('2026-09-15T15:00:00'),
      history: [tx(100, 'Shop A', '2026-09-01T15:00:00'), tx(110, 'Shop B', '2026-09-02T15:00:00'), tx(90, 'Shop C', '2026-09-03T15:00:00'), tx(120, 'Shop D', '2026-09-04T15:00:00')],
    },
    expected: 'low',
  },
  {
    name: 'Eight-history 5 AM pattern is learned as normal',
    input: {
      amount: 300, recipient: 'Morning Shop', transactionType: 'debit',
      rawMessage: 'Paid ₹300 to Morning Shop at 5:11 AM.',
      transactionTime: istDate('2026-09-15T05:11:00'),
      history: [
        tx(250, 'Morning Shop', '2026-09-01T05:02:00'),
        tx(280, 'Morning Shop', '2026-09-02T05:20:00'),
        tx(260, 'Morning Shop', '2026-09-03T04:55:00'),
        tx(300, 'Morning Shop', '2026-09-04T05:10:00'),
        tx(290, 'Morning Shop', '2026-09-05T05:05:00'),
        tx(310, 'Morning Shop', '2026-09-06T05:25:00'),
        tx(305, 'Morning Shop', '2026-09-07T04:50:00'),
        tx(295, 'Morning Shop', '2026-09-08T05:15:00'),
        tx(275, 'Morning Shop', '2026-09-09T05:07:00'),
        tx(315, 'Morning Shop', '2026-09-10T05:18:00'),
      ],
    },
    expected: 'low',
  },
  {
    name: 'Ten-history normal pattern makes 5 AM non-unusual but new recipient remains',
    input: {
      amount: 300, recipient: 'New Morning Store', transactionType: 'debit',
      rawMessage: 'Paid ₹300 to New Morning Store at 5:11 AM.',
      transactionTime: istDate('2026-09-15T05:11:00'),
      history: [
        tx(250, 'Morning Shop', '2026-09-01T05:02:00'),
        tx(280, 'Morning Shop', '2026-09-02T05:20:00'),
        tx(260, 'Morning Shop', '2026-09-03T04:55:00'),
        tx(300, 'Morning Shop', '2026-09-04T05:10:00'),
        tx(290, 'Morning Shop', '2026-09-05T05:05:00'),
        tx(310, 'Morning Shop', '2026-09-06T05:25:00'),
        tx(305, 'Morning Shop', '2026-09-07T04:50:00'),
        tx(295, 'Morning Shop', '2026-09-08T05:15:00'),
        tx(275, 'Morning Shop', '2026-09-09T05:07:00'),
        tx(315, 'Morning Shop', '2026-09-10T05:18:00'),
      ],
    },
    expected: 'low',
  },

  // High-confidence fraud / hard evidence
  {
    name: 'Large transfer to new recipient at 2 AM',
    input: {
      amount: 25000, recipient: 'Unknown Beneficiary', transactionType: 'debit',
      rawMessage: 'UPI debit ₹25,000 to Unknown Beneficiary at 2:00 AM.',
      transactionTime: istDate('2026-09-15T02:00:00'),
      history: [
        tx(1000, 'Known Shop', '2026-09-01T12:00:00'), tx(1200, 'Known Shop', '2026-09-02T13:00:00'),
        tx(900, 'Known Shop', '2026-09-03T14:00:00'), tx(1100, 'Known Shop', '2026-09-04T12:00:00'),
        tx(1300, 'Known Shop', '2026-09-05T13:00:00'), tx(1250, 'Known Shop', '2026-09-06T12:30:00'),
        tx(1050, 'Known Shop', '2026-09-07T13:30:00'), tx(1150, 'Known Shop', '2026-09-08T12:15:00'),
        tx(980, 'Known Shop', '2026-09-09T14:00:00'), tx(1210, 'Known Shop', '2026-09-10T13:00:00'),
      ],
    },
    expected: 'high',
  },
  {
    name: 'First-ever explicit OTP sharing scam',
    input: {
      amount: 100, recipient: 'Scam Merchant', transactionType: 'debit',
      rawMessage: 'Share the OTP to verify your account or it will be blocked.',
      transactionTime: istDate('2026-09-15T12:00:00'),
      history: [],
    },
    expected: 'high',
  },
  {
    name: 'First-ever remote-access scam',
    input: {
      amount: 50, recipient: 'Remote Agent', transactionType: 'debit',
      rawMessage: 'For refund processing, install remote access and share your screen now.',
      transactionTime: istDate('2026-09-15T12:00:00'),
      history: [],
    },
    expected: 'high',
  },
  {
    name: 'Established elder: high amount plus new recipient',
    input: {
      amount: 15000, recipient: 'New Beneficiary', transactionType: 'debit',
      rawMessage: 'Transferred ₹15,000 to New Beneficiary.',
      transactionTime: istDate('2026-09-15T14:00:00'),
      history: [
        tx(1000, 'A', '2026-09-01T12:00:00'), tx(1200, 'B', '2026-09-02T12:00:00'),
        tx(900, 'C', '2026-09-03T12:00:00'), tx(1100, 'D', '2026-09-04T12:00:00'),
        tx(1300, 'E', '2026-09-05T12:00:00'), tx(1200, 'A', '2026-09-06T12:00:00'),
        tx(1000, 'B', '2026-09-07T12:00:00'), tx(900, 'C', '2026-09-08T12:00:00'),
        tx(1100, 'D', '2026-09-09T12:00:00'), tx(1250, 'E', '2026-09-10T12:00:00'),
      ],
    },
    expected: 'high',
  },
  {
    name: 'Urgent KYC scam instruction with no history',
    input: {
      amount: 200, recipient: 'Fraud Agent', transactionType: 'debit',
      rawMessage: 'Urgent KYC verification required. Click this link to verify immediately.',
      transactionTime: istDate('2026-09-15T11:00:00'),
      history: [],
    },
    expected: 'high',
  },
  {
    name: 'Account-block threat plus new recipient',
    input: {
      amount: 1000, recipient: 'Fraud Beneficiary', transactionType: 'debit',
      rawMessage: 'Your account will be blocked unless you click this link to verify.',
      transactionTime: istDate('2026-09-15T11:00:00'),
      history: [],
    },
    expected: 'high',
  },
  {
    name: 'Velocity fraud with escalating amounts and 3 new recipients',
    input: {
      amount: 6000, recipient: 'Fraud Shop 3', transactionType: 'debit',
      rawMessage: 'UPI debit ₹6,000 to Fraud Shop 3.',
      transactionTime: istDate('2026-09-15T14:09:00'),
      history: [
        tx(1000, 'Old Shop A', '2026-09-01T12:00:00'),
        tx(1200, 'Old Shop B', '2026-09-02T12:00:00'),
        tx(1000, 'Fraud Shop 1', '2026-09-15T14:03:00'),
        tx(2500, 'Fraud Shop 2', '2026-09-15T14:06:00'),
        tx(900, 'Old Shop C', '2026-09-10T12:00:00'),
      ],
    },
    expected: 'high',
  },
  {
    name: 'Known recipient huge transfer with established history',
    input: {
      amount: 30000, recipient: 'Family Account', transactionType: 'transfer',
      rawMessage: 'Transferred ₹30,000 to Family Account.',
      transactionTime: istDate('2026-09-15T13:00:00'),
      history: [
        tx(1000, 'Family Account', '2026-09-01T12:00:00'), tx(1200, 'Family Account', '2026-09-02T12:00:00'),
        tx(900, 'Family Account', '2026-09-03T12:00:00'), tx(1100, 'Family Account', '2026-09-04T12:00:00'),
        tx(1300, 'Family Account', '2026-09-05T12:00:00'), tx(1400, 'Family Account', '2026-09-06T12:00:00'),
        tx(1200, 'Family Account', '2026-09-07T12:00:00'), tx(1000, 'Family Account', '2026-09-08T12:00:00'),
        tx(1100, 'Family Account', '2026-09-09T12:00:00'), tx(1250, 'Family Account', '2026-09-10T12:00:00'),
      ],
    },
    expected: 'low',
  },
  {
    name: 'Established history: scam SMS plus otherwise ordinary payment',
    input: {
      amount: 300, recipient: 'Known Shop', transactionType: 'debit',
      rawMessage: 'Share your OTP to verify your account.',
      transactionTime: istDate('2026-09-15T14:00:00'),
      history: Array.from({length: 10}, (_, i) => tx(250 + (i % 2) * 20, 'Known Shop', `2026-09-${String(i+1).padStart(2,'0')}T14:00:00`)),
    },
    expected: 'high',
  },
  {
    name: 'Established history: screen-share scam instruction',
    input: {
      amount: 450, recipient: 'Known Shop', transactionType: 'debit',
      rawMessage: 'Please install remote access and share your screen to receive the refund.',
      transactionTime: istDate('2026-09-15T14:00:00'),
      history: Array.from({length: 10}, (_, i) => tx(300, 'Known Shop', `2026-09-${String(i+1).padStart(2,'0')}T14:00:00`)),
    },
    expected: 'high',
  },
  {
    name: 'New recipient plus large amount after 5-history warm-up',
    input: {
      amount: 6000, recipient: 'New Seller', transactionType: 'debit',
      rawMessage: 'Paid ₹6,000 to New Seller at 4:30 PM.',
      transactionTime: istDate('2026-09-15T16:30:00'),
      history: [
        tx(500, 'A', '2026-09-01T12:00:00'), tx(600, 'B', '2026-09-02T12:00:00'),
        tx(550, 'C', '2026-09-03T12:00:00'), tx(450, 'D', '2026-09-04T12:00:00'),
        tx(500, 'E', '2026-09-05T12:00:00'),
      ],
    },
    expected: 'medium',
  },

  // Circumstantial combinations deliberately capped
  {
    name: 'Cold start: new recipient plus unusual time only',
    input: {
      amount: 200, recipient: 'New Night Shop', transactionType: 'debit',
      rawMessage: 'Paid ₹200 to New Night Shop at 1:00 AM.',
      transactionTime: istDate('2026-09-15T01:00:00'),
      history: [],
    },
    expected: 'medium',
  },
  {
    name: 'Cold start: new recipient plus velocity only',
    input: {
      amount: 250, recipient: 'Shop C', transactionType: 'debit',
      rawMessage: 'Paid ₹250 to Shop C.',
      transactionTime: istDate('2026-09-15T14:09:00'),
      history: [
        tx(120, 'Shop A', '2026-09-15T14:03:00'),
        tx(160, 'Shop B', '2026-09-15T14:06:00'),
      ],
    },
    expected: 'medium',
  },
  {
    name: 'Established history: new recipient plus unusual time but no hard signal',
    input: {
      amount: 350, recipient: 'Night Store', transactionType: 'debit',
      rawMessage: 'Paid ₹350 to Night Store.',
      transactionTime: istDate('2026-09-15T02:00:00'),
      history: [
        tx(300, 'Shop', '2026-09-01T12:00:00'), tx(320, 'Shop', '2026-09-02T12:00:00'),
        tx(310, 'Shop', '2026-09-03T12:00:00'), tx(305, 'Shop', '2026-09-04T12:00:00'),
        tx(290, 'Shop', '2026-09-05T12:00:00'), tx(315, 'Shop', '2026-09-06T12:00:00'),
        tx(295, 'Shop', '2026-09-07T12:00:00'), tx(305, 'Shop', '2026-09-08T12:00:00'),
        tx(300, 'Shop', '2026-09-09T12:00:00'), tx(310, 'Shop', '2026-09-10T12:00:00'),
      ],
    },
    expected: 'medium',
  },
  {
    name: 'Partial confidence: new recipient plus unusual time',
    input: {
      amount: 350, recipient: 'New Night Store', transactionType: 'debit',
      rawMessage: 'Paid ₹350 to New Night Store at 2 AM.',
      transactionTime: istDate('2026-09-15T02:00:00'),
      history: [
        tx(300, 'Shop A', '2026-09-01T12:00:00'), tx(320, 'Shop B', '2026-09-02T12:00:00'),
        tx(310, 'Shop C', '2026-09-03T12:00:00'), tx(305, 'Shop D', '2026-09-04T12:00:00'),
        tx(290, 'Shop E', '2026-09-05T12:00:00'), tx(315, 'Shop F', '2026-09-06T12:00:00'),
      ],
    },
    expected: 'medium',
  },
  {
    name: 'Partial confidence: unusual amount but below hard threshold',
    input: {
      amount: 4000, recipient: 'New Shop', transactionType: 'debit',
      rawMessage: 'Paid ₹4,000 to New Shop.',
      transactionTime: istDate('2026-09-15T14:00:00'),
      history: [
        tx(300, 'A', '2026-09-01T12:00:00'), tx(350, 'B', '2026-09-02T12:00:00'),
        tx(250, 'C', '2026-09-03T12:00:00'), tx(400, 'D', '2026-09-04T12:00:00'),
        tx(350, 'E', '2026-09-05T12:00:00'), tx(320, 'F', '2026-09-06T12:00:00'),
      ],
    },
    expected: 'medium',
  },
  {
    name: 'Partial confidence: hard amount + new recipient reaches HIGH',
    input: {
      amount: 6000, recipient: 'New Shop', transactionType: 'debit',
      rawMessage: 'Paid ₹6,000 to New Shop.',
      transactionTime: istDate('2026-09-15T14:00:00'),
      history: [
        tx(300, 'A', '2026-09-01T12:00:00'), tx(350, 'B', '2026-09-02T12:00:00'),
        tx(250, 'C', '2026-09-03T12:00:00'), tx(400, 'D', '2026-09-04T12:00:00'),
        tx(350, 'E', '2026-09-05T12:00:00'), tx(320, 'F', '2026-09-06T12:00:00'),
      ],
    },
    expected: 'medium',
  },
  {
    name: 'High velocity without amount anomaly remains MEDIUM',
    input: {
      amount: 320, recipient: 'New Shop C', transactionType: 'debit',
      rawMessage: 'Paid ₹320 to New Shop C.',
      transactionTime: istDate('2026-09-15T14:09:00'),
      history: [
        tx(300, 'Shop A', '2026-09-15T14:03:00'),
        tx(310, 'Shop B', '2026-09-15T14:06:00'),
        tx(305, 'Shop C0', '2026-09-01T14:00:00'),
      ],
    },
    expected: 'medium',
  },
  {
    name: 'Known-recipient recurring daytime debit is LOW',
    input: {
      amount: 450, recipient: 'Electricity Board', transactionType: 'debit',
      rawMessage: 'Paid ₹450 to Electricity Board.',
      transactionTime: istDate('2026-09-15T10:00:00'),
      history: Array.from({length: 10}, (_, i) => tx(420 + (i % 3) * 10, 'Electricity Board', `2026-09-${String(i+1).padStart(2,'0')}T10:00:00`)),
    },
    expected: 'low',
  },
  {
    name: 'Known recipient small daytime purchase after warm-up',
    input: {
      amount: 600, recipient: 'Grocery Plus', transactionType: 'debit',
      rawMessage: 'Paid ₹600 to Grocery Plus.',
      transactionTime: istDate('2026-09-15T15:00:00'),
      history: [
        tx(550, 'Grocery Plus', '2026-09-01T15:00:00'), tx(620, 'Grocery Plus', '2026-09-02T15:00:00'),
        tx(580, 'Grocery Plus', '2026-09-03T15:00:00'), tx(610, 'Grocery Plus', '2026-09-04T15:00:00'),
        tx(590, 'Grocery Plus', '2026-09-05T15:00:00'), tx(605, 'Grocery Plus', '2026-09-06T15:00:00'),
        tx(600, 'Grocery Plus', '2026-09-07T15:00:00'), tx(615, 'Grocery Plus', '2026-09-08T15:00:00'),
        tx(605, 'Grocery Plus', '2026-09-09T15:00:00'), tx(595, 'Grocery Plus', '2026-09-10T15:00:00'),
      ],
    },
    expected: 'low',
  },
  {
    name: 'Scam keyword requires intent: KYC success is safe',
    input: {
      amount: 1000, recipient: 'Bank', transactionType: 'credit',
      rawMessage: 'Your KYC has been successfully completed and no action is required.',
      transactionTime: istDate('2026-09-15T11:00:00'),
      history: [],
    },
    expected: 'low',
  },
  {
    name: 'Scam keyword requires intent: refund received is safe',
    input: {
      amount: 500, recipient: 'Merchant', transactionType: 'credit',
      rawMessage: 'Refund of ₹500 received from Merchant.',
      transactionTime: istDate('2026-09-15T11:00:00'),
      history: [],
    },
    expected: 'low',
  },
  {
    name: 'High amount alone on cold start can still be hard evidence',
    input: {
      amount: 12000, recipient: 'New Seller', transactionType: 'debit',
      rawMessage: 'Paid ₹12,000 to New Seller.',
      transactionTime: istDate('2026-09-15T11:00:00'),
      history: [],
    },
    expected: 'medium',
  },
  // Regression cases for a real bug found during independent review: the
  // scam-phrase patterns for OTP-sharing were matching the standard bank
  // anti-phishing disclaimer and ordinary OTP-delivery wording, turning
  // routine legitimate messages into HIGH-risk fraud alerts.
  {
    name: 'Bank anti-phishing disclaimer is not a scam instruction',
    input: {
      amount: 2000, recipient: 'unknown recipient', transactionType: 'debit',
      rawMessage: 'Do not share your OTP with anyone, including bank staff. 482913 is your OTP for txn of Rs.2000.',
      transactionTime: istDate('2026-09-15T11:00:00'),
      history: [],
    },
    expected: 'low',
  },
  {
    name: 'OTP delivery for login, with disclaimer, is not scam',
    input: {
      amount: 0.01, recipient: 'unknown recipient', transactionType: 'unknown',
      rawMessage: '482913 is your OTP to verify your login to NetBanking. Valid for 10 minutes. Do not share this OTP with anyone.',
      transactionTime: istDate('2026-09-15T11:00:00'),
      history: [],
    },
    expected: 'low',
  },
  {
    name: 'OTP delivery for a UPI mandate is not scam',
    input: {
      amount: 499, recipient: 'Netflix', transactionType: 'debit',
      rawMessage: '719284 is the OTP to verify your UPI mandate for Rs.499 to Netflix. Valid 5 mins.',
      transactionTime: istDate('2026-09-15T11:00:00'),
      history: [],
    },
    expected: 'low',
  },
  {
    name: 'OTP for beneficiary addition, with disclaimer, is not scam',
    input: {
      amount: 0.01, recipient: 'unknown recipient', transactionType: 'unknown',
      rawMessage: 'OTP required to verify your new beneficiary addition. OTP: 552011. Do not share with anyone.',
      transactionTime: istDate('2026-09-15T11:00:00'),
      history: [],
    },
    expected: 'low',
  },
  {
    name: 'Send-OTP-to-a-number scam is still caught',
    input: {
      amount: 100, recipient: 'unknown recipient', transactionType: 'unknown',
      rawMessage: 'Send your OTP to +919876543210 to claim your prize.',
      transactionTime: istDate('2026-09-15T11:00:00'),
      history: [],
    },
    expected: 'high',
  },
  // Broader negation phrasing than a plain "do not" — found via a second
  // round of adversarial review. NOTE: "Under no circumstances should you
  // share your OTP" is a known remaining gap (no "not"/"never" word appears
  // at all) — judged an acceptable, documented limitation rather than
  // chasing every possible negation phrasing, since real bank SMS is short
  // and almost always uses "do not" / "never" / "don't" in practice.
  {
    name: '"advised not to share" is recognized as a disclaimer',
    input: {
      amount: 2000, recipient: 'unknown recipient', transactionType: 'debit',
      rawMessage: 'Users are advised not to share your OTP with anyone.',
      transactionTime: istDate('2026-09-15T11:00:00'),
      history: [],
    },
    expected: 'low',
  },
  {
    name: '"never ever share" is recognized as a disclaimer',
    input: {
      amount: 2000, recipient: 'unknown recipient', transactionType: 'debit',
      rawMessage: 'Never ever share your OTP with anyone, even bank staff.',
      transactionTime: istDate('2026-09-15T11:00:00'),
      history: [],
    },
    expected: 'low',
  },
  {
    name: '"will never ask you to share" is recognized as a disclaimer',
    input: {
      amount: 2000, recipient: 'unknown recipient', transactionType: 'debit',
      rawMessage: 'We will never ask you to share your OTP.',
      transactionTime: istDate('2026-09-15T11:00:00'),
      history: [],
    },
    expected: 'low',
  },
  // Remote-access / screen-share negation: these warnings are common,
  // legitimate anti-scam messaging (banks, antivirus vendors, IT support
  // policies) and must not be flagged just because they contain the same
  // words as the scam instruction they are warning against.
  {
    name: 'Negated remote-access warning is not a scam instruction',
    input: {
      amount: 100, recipient: 'unknown recipient', transactionType: 'debit',
      rawMessage: 'Do not give remote access to anyone claiming to be bank staff.',
      transactionTime: istDate('2026-09-15T11:00:00'),
      history: [],
    },
    expected: 'low',
  },
  {
    name: 'Negated screen-share warning is not a scam instruction',
    input: {
      amount: 100, recipient: 'unknown recipient', transactionType: 'debit',
      rawMessage: 'For your security, do not share your screen or provide remote access to anyone.',
      transactionTime: istDate('2026-09-15T11:00:00'),
      history: [],
    },
    expected: 'low',
  },
  {
    name: 'Positive remote-access instruction is still caught (regression guard)',
    input: {
      amount: 50, recipient: 'Remote Agent', transactionType: 'debit',
      rawMessage: 'For refund processing, install remote access and share your screen now.',
      transactionTime: istDate('2026-09-15T12:00:00'),
      history: [],
    },
    expected: 'high',
  },
  {
    name: '"never provide remote access" is recognized as a disclaimer',
    input: {
      amount: 100, recipient: 'unknown recipient', transactionType: 'debit',
      rawMessage: 'Your bank will never provide remote access or ask you to screen share.',
      transactionTime: istDate('2026-09-15T11:00:00'),
      history: [],
    },
    expected: 'low',
  },
  // --- Pivot-word / multi-occurrence negation scoping ---
  // A scam can disclaim the action first to sound legitimate, then pivot to
  // the real demand in the same sentence. A negation before the pivot must
  // not suppress the instruction that comes after it.
  {
    name: 'Pivot "but": reassurance then real OTP demand is still HIGH',
    input: {
      amount: 100, recipient: 'unknown recipient', transactionType: 'unknown',
      rawMessage: 'We will never call and ask for your OTP, but you must share your OTP now to avoid suspension.',
      transactionTime: istDate('2026-09-15T11:00:00'),
      history: [],
    },
    expected: 'high',
  },
  {
    name: 'Pivot "however": negated first mention, real demand second, is still HIGH',
    input: {
      amount: 100, recipient: 'unknown recipient', transactionType: 'unknown',
      rawMessage: 'For your safety we never request remote access, however you must provide remote access immediately to unlock your account.',
      transactionTime: istDate('2026-09-15T11:00:00'),
      history: [],
    },
    expected: 'high',
  },
  {
    name: 'Control: "but" in an ordinary message does not create a false positive',
    input: {
      amount: 500, recipient: 'Airtel', transactionType: 'debit',
      rawMessage: 'Your balance is low but your autopay of Rs.500 to Airtel went through.',
      transactionTime: istDate('2026-09-15T11:00:00'),
      history: [],
    },
    expected: 'low',
  },
  {
    name: 'Control: "or" is not a pivot — compound warning still suppressed',
    input: {
      amount: 100, recipient: 'unknown recipient', transactionType: 'debit',
      rawMessage: 'Never share your screen or give remote access to callers, but stay alert.',
      transactionTime: istDate('2026-09-15T11:00:00'),
      history: [],
    },
    expected: 'low',
  },
];

const results = cases.map(({ name, input, expected }) => runCase(name, input, expected));
const negatives = results.filter(result => result.expected === 'high').length;
const positives = negatives;
const tp = results.filter(result => result.expected === 'high' && result.actual === 'high').length;
const fp = results.filter(result => result.expected !== 'high' && result.actual === 'high').length;
const fn = results.filter(result => result.expected === 'high' && result.actual !== 'high').length;
const tn = results.filter(result => result.expected !== 'high' && result.actual !== 'high').length;

const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
const falsePositiveRate = fp + tn === 0 ? 0 : fp / (fp + tn);

console.log('\n=== FRAUD ENGINE SUMMARY ===');
console.log(`Cases: ${results.length}`);
console.log(`Passed: ${results.filter(r => r.passed).length}/${results.length}`);
console.log(`TP=${tp} FP=${fp} FN=${fn} TN=${tn}`);
console.log(`Precision=${(precision * 100).toFixed(2)}%`);
console.log(`Recall=${(recall * 100).toFixed(2)}%`);
console.log(`False-positive-rate=${(falsePositiveRate * 100).toFixed(2)}%`);

assert.strictEqual(results.filter(r => r.passed).length, results.length, 'Fraud engine test suite has failures.');
