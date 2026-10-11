# SurakshaDigi Backend — Recipient-Parsing Fix, Round 2

## Why round 1 was insufficient
Round 1 (`CLAUDE_PATCH_NOTES_RECIPIENT_FIX.md`) added two checks to
`extractRecipient()`'s candidate filter:
1. Reject a candidate whose first word is a known instruction verb
   (`verify`, `reverse`, `reactivate`, ...).
2. Reject a candidate longer than 6 words with no VPA-shaped token.

Both checks answer *"does this look like a scam instruction?"* — neither
one answers *"does this look like a recipient?"*. So once a scam CTA was
rejected by check 1, the extractor moved on to the **next** `to`/`towards`/
`from` occurrence, or the same message's other pattern, and happily
returned whatever short, non-verb, non-long fragment it found there — even
though that fragment was just as much *not a recipient* as the CTA text
was. Confirmed by re-running round 1's own test file and reading its
assertions: three "PASS" results were asserting `"KBC lottery processing
fee"`, `"your account"`, and `"KYC expiry"` as acceptable output — none of
which is a name, VPA, or merchant. Same category of bug as round 1, just
relocated to different, non-verb, short text elsewhere in the same message.
This is what round 2 fixes.

## Root cause
`extractRecipient()` had no positive definition of what a recipient looks
like — only negative filters for what a *scam instruction* looks like. A
positive/negative pair of filters that only covers one side of the
distinction will always leave a gap on the other side.

## Fix
Added `looksLikeRecipient()`, a structural, shape-based check applied to
every candidate **in addition to** (not instead of) the two existing
checks. A candidate is only accepted if it is shaped like:
- **a VPA** — contains `@` (checked first and unconditionally, since VPA
  handles are conventionally lowercase and would otherwise fail the next
  check), or
- **a name or merchant token** — every word is either one of a small,
  closed set of lowercase connector words (`of`, `the`, `and`, `for`, `at`,
  `de`, `la` — so "Bank of India" isn't rejected for the lowercase "of"),
  or starts with a capital letter and contains only letters, apostrophes,
  ampersands, periods, or hyphens (covers "Priya Sharma", "AMAZON PAY",
  "O'Brien", "M&S"). At least one word must satisfy the capitalized case.

Anything else — a lowercase noun phrase ("your account"), a mixed-case
phrase where only the first word happens to be capitalized ("KBC lottery
processing fee", "KYC expiry"), or a token containing digits or a slash
(see below) — is rejected and the extractor falls through to
`"Unknown recipient"`, exactly as it already did correctly for the two
scam-CTA cases round 1 got right.

This is deliberately **not** three new string exclusions. It's a shape
test that has no idea what "KBC lottery processing fee" or "your account"
specifically say — it only knows they aren't capitalized name/merchant
tokens. A different scam phrasing with the same shape (lowercase noun
phrase, no verb, ≤6 words) is rejected the same way without needing a new
entry added.

## A second, non-obvious case the fix also had to cover
Fixing the `towards` match for `"...towards KBC lottery processing fee..."`
surfaced a case not in the original bug report. Once the `towards` match is
correctly rejected, the extractor's next pattern (`from`) gets a chance it
never got before (round 1 always accepted the `towards` match first, so
`from` was never reached for this message). In the same test message, the
`from` pattern matches `"A/c XX1234"` — an account number, not a
recipient — and a naive shape check (e.g. stripping trailing digits before
testing capitalization) would have accepted it, because `"XX"` alone looks
capitalized. Guarded against this specifically: punctuation is stripped
only from the **edges** of each word, never the middle, so a mid-token
character that doesn't belong in a name (the `/` in `"A/c"`, the digits in
`"XX1234"`) stays visible to the shape check and causes rejection. Caught
by tracing the regex behavior by hand before writing the test update, not
found via the pre-existing test suite (round 1's own suite never exercised
this path, since its accepted-but-wrong `towards` match short-circuited the
loop before `from` was tried).

## Test changes
Updated exactly the 3 assertions specified, in `scripts/sms-parser.test.js`,
that were asserting a non-recipient string as passing output. All three now
assert `r === 'Unknown recipient'`, matching the two cases that already did
this correctly. No new test cases were added (per the round-2 spec's "still
12/12" expectation) — the `"A/c XX1234"` edge case above is already
exercised by the existing case 1 message (`"...from A/c XX1234 towards KBC
lottery processing fee..."`), so no separate case was needed to cover it.

## Confirming the updated tests actually enforce the fix
Same discipline as round 1: reverted `smsParser.js` to a round-1-only
version (the two original checks, no `looksLikeRecipient`) and reran the
**updated** `sms-parser.test.js` — **9/12**, with failures on exactly the
three now-corrected assertions (`got="KBC lottery processing fee"`,
`got="your account"`, `got="KYC expiry"`). Restored the fix — 12/12 for the
right reasons this time. This also re-confirms round 1's own regression
guards (VPA-with-dot, named UPI transfers, the punctuated/unpunctuated
instructional-"to" cases) are untouched by this round's change, since they
were unaffected in both the reverted and fixed runs.

## Test results
```
Fraud engine:         51/51
Password reset:        6/6
Fraud service:        14/14
Device pairing race:   3/3
Device SMS endpoint:   8/8
SMS parser:           12/12
------------------------------
TOTAL:                94/94
```
`node --check` clean on the modified file. Full output available via
`npm test`.

## Scope and dependency check
Diffed the full extracted tree against the untouched upload before making
any change, and again after: only `src/utils/smsParser.js` and
`scripts/sms-parser.test.js` differ. `package.json` and `package-lock.json`
are byte-identical (confirmed via `md5sum`) to the versions in the
uploaded zip — no dependency was added, removed, or otherwise touched, and
no lockfile was regenerated.

## Still-open, unrelated to this round's fix
The connector-word list (`of`, `the`, `and`, `for`, `at`, `de`, `la`) and
the allowed in-word characters (`'&.-`) are a reasonable but not
exhaustive attempt to cover real Indian bank/merchant naming conventions
without overfitting to this round's three test cases — they weren't
exercised by any existing test, so they're best-effort rather than
verified. If a legitimate merchant name uses a lowercase connector word not
in this list (e.g. "Foo & Sons"), or a name-shaped token this regex doesn't
anticipate, it would currently fall back to `"Unknown recipient"` rather
than being wrongly accepted — the fix errs toward the safer of the two
failure modes, consistent with the spec's own sanctioned fallback, but
flagging it rather than presenting the word list as exhaustive.
