const assert = require('assert');
const { extractRecipient, parseBankSms } = require('../src/utils/smsParser');

const results = [];
const check = (name, message, assertion) => {
  const got = extractRecipient(message);
  const passed = assertion(got);
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'} | got=${JSON.stringify(got)} | ${name}`);
};

// --- Regression guard: real recipients must keep extracting correctly ---
check(
  'VPA with a dot in the local part is not truncated',
  'Rs.450.00 debited from A/c XX1234 on 16-Sep-26 to VPA ramesh.kirana@okaxis. Avl Bal Rs.12,540.00 -SBI',
  (r) => r.toLowerCase().includes('ramesh.kirana@okaxis')
);
check(
  'Name via UPI, stopped at "via" as before',
  'Rs.1,200 sent to Priya Sharma via UPI. UPI Ref No 402816554321. -HDFC Bank',
  (r) => r === 'Priya Sharma'
);
check(
  'Name via UPI, second example',
  'Rs.500 sent to Ramesh Kirana via UPI. Ref 100234. -SBI',
  (r) => r === 'Ramesh Kirana'
);
check(
  'VPA without a dot still extracts',
  'Rs.2,500 debited at 03:47 AM from A/c XX1234 via UPI to unknown@ybl. -HDFC Bank',
  (r) => r.toLowerCase().includes('unknown@ybl')
);

// --- Bug fix: infinitive/instructional "to" must not be stored as a recipient ---
check(
  'Scam CTA "to verify immediately" is not a recipient',
  'URGENT: Your account will be BLOCKED in 2 hours. Click link and share OTP to verify immediately: bit.ly/xyz123',
  (r) => !/verify immediately/i.test(r)
);
check(
  'Scam CTA "to reverse this debit" is not a recipient (round 2: was falling through to the non-recipient "KBC lottery processing fee" instead of Unknown)',
  'Rs.49,999 debited from A/c XX1234 towards KBC lottery processing fee. Share OTP 812934 immediately to reverse this debit. -Unknown',
  (r) => r === 'Unknown recipient'
);
check(
  'Scam CTA "to reverse this unauthorized..." is not a recipient (round 2: was falling through to the non-recipient "your account" instead of Unknown)',
  'Rs.9,500 debited from your account. To reverse this unauthorized transaction and block your card, share OTP now on this number. -Alert',
  (r) => r === 'Unknown recipient'
);
check(
  '"due to a security update...to verify..." run-on is not a recipient (the run-on-capture gap found during testing)',
  'Rs.750 debited via UPI. We will never ask for your OTP over phone, however due to a security update please share OTP 456789 to verify your account now.',
  (r) => !/verify your account now/i.test(r) && !/security update please share otp/i.test(r)
);
check(
  'Scam CTA "to reactivate or lose access" is not a recipient (round 2: was falling through to the non-recipient "KYC expiry" instead of Unknown)',
  'Dear customer your a/c is suspended due to KYC expiry. Send OTP now to reactivate or lose access permanently.',
  (r) => r === 'Unknown recipient'
);

// --- Additional coverage for the fix's own edge cases ---
check(
  'When clauses ARE punctuated, an instructional "to" no longer hides a later real recipient (this is what the multi-occurrence check actually buys us)',
  'Click here to verify. Then send Rs.500 to Ramesh Kumar via UPI.',
  (r) => r === 'Ramesh Kumar'
);
check(
  'KNOWN LIMITATION: instructional "to" and a real recipient in the same unpunctuated clause fall back to Unknown rather than finding the real recipient — acceptable per spec (Unknown is the sanctioned fallback), not a failure, but not the "best" outcome either. Documented, not chased further.',
  'Click here to verify your identity, then send Rs.500 to Ramesh Kumar to complete the transfer.',
  (r) => r === 'Unknown recipient' || r === 'Ramesh Kumar'
);
// --- Full pipeline check: confirm the fix reaches parseBankSms's output field, not just the isolated extractRecipient() function ---
const pipelineResult = parseBankSms(
  'Rs.49,999 debited towards KBC lottery fee. Share OTP 812934 immediately to reverse this debit. -Unknown'
);
const pipelinePassed = pipelineResult.success && !/reverse this debit/i.test(pipelineResult.data.recipient);
results.push({ name: 'Full parseBankSms pipeline: garbage no longer reaches the final recipient field', passed: pipelinePassed });
console.log(`${pipelinePassed ? 'PASS' : 'FAIL'} | got=${JSON.stringify(pipelineResult.data?.recipient)} | Full parseBankSms pipeline check`);

const passed = results.filter((r) => r.passed).length;
console.log(`\n=== SMS PARSER (RECIPIENT EXTRACTION) SUMMARY ===`);
console.log(`Cases: ${results.length}`);
console.log(`Passed: ${passed}/${results.length}`);
assert.strictEqual(passed, results.length, 'sms-parser regression suite has failures.');
