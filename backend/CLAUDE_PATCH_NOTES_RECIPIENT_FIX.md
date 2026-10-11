# SurakshaDigi Backend — Recipient-Parsing Fix (on top of v4)

**Note on the starting point:** the zip this fix was requested against
(`SurakshaDigi_Backend_New.zip`) was, on inspection, byte-for-byte identical
to `..._CLAUDE_PATCHED_v4.zip` — including `smsParser.js` itself (identical
md5). The requested fix had not actually been applied to what was uploaded.
This patch is built directly on the real v4 codebase, confirmed via a full
`npm test` run before making any change.

## Root cause
`extractRecipient()` in `src/utils/smsParser.js` matched `to` followed by
trailing text, intended for "sent **to** Ramesh Kumar" — but had no way to
tell that apart from the infinitive "to" in scam CTAs ("click here **to**
verify", "share OTP **to** reverse this debit"), so it stored the CTA text
itself as the recipient.

## Fix
1. **Instructional-CTA rejection.** A captured candidate is rejected if it
   opens with a known instruction verb (`verify`, `reverse`, `reactivate`,
   `share`, `click`, `pay`, etc. — 39 total, scam-CTA-focused rather than
   exhaustive; see code comment for the accepted trade-off).
2. **Shape-based rejection.** A candidate longer than 6 words with no
   VPA-shaped token (`\S+@\S+`) is also rejected. This exists because of a
   case the verb check alone couldn't catch — see below.
3. **Check every occurrence, not just the first**, for the `to`/`towards`/
   `from` patterns. A message can have an instructional "to" and a real
   recipient's "to" in either order.

## Two things found during testing that the request didn't anticipate

**A pre-existing, unrelated bug in the same function.** The regression-guard
case `"...to VPA ramesh.kirana@okaxis. Avl Bal..."` was listed as "currently
works correctly." It doesn't, in the actual v4 code — a VPA whose local part
contains a dot gets truncated at the first dot (`"VPA ramesh.kirana@okaxis"`
→ `"VPA ramesh"`), because the stop condition treated *any* literal `.` as a
sentence boundary. Confirmed against the untouched v4 file before writing
any fix, to rule out this being something I'd just introduced. Fixed by only
treating `.` as a boundary when it isn't immediately followed by a word
character — a real sentence-ending period is followed by a space; a dot
inside a VPA is followed by another letter.

**My own first attempt at the fix had a gap, caught before delivery.** The
case `"...however due to a security update please share OTP 456789 to
verify your account now."` still leaked through after step 1 alone. The
reason: the *first* `to` in the sentence is "due **to** a security update,"
not "**to** verify" — and since nothing stops the lazy capture before the
sentence's only period, it swallows both clauses into one candidate starting
with "a", which isn't in the verb list. No pivot-word or verb-list fix
catches "due to X" as a category. Step 2 (the length/shape check) is what
actually closes this — the swallowed candidate is 11 words with no `@`, so
it's rejected regardless of what it starts with. I want to be direct that
this fix needed a second iteration internally before every spec case passed;
it isn't presented as first-try-correct.

## Test results
```
Fraud engine:         51/51
Password reset:        6/6
Fraud service:        14/14
Device pairing race:   3/3
Device SMS endpoint:   8/8
SMS parser (new):     12/12
------------------------------
TOTAL:                94/94
```
`node --check` clean on every file. Full output available via `npm test`.

**Confirmed the new test suite actually catches the original bug**, not just
passes against the fix: reverted `smsParser.js` to the untouched v4 version
and reran `sms-parser.test.js` — **4/12**, all four failures on the exact
scam-CTA cases. Restored the fix — 12/12.

**Confirmed scope was respected**: diffed the full tree against the
pre-fix baseline. Only `smsParser.js`, `package.json` (wiring the new test
into `npm test`), and the new `scripts/sms-parser.test.js` changed.
`fraudSignals.js`, `fraudService.js`, `deviceController.js`, and
`transactionController.js` are byte-identical to v4.

## Honest, documented limitation (not fixed, not hidden)
When an instructional "to" and a real recipient's "to" sit in the **same
unpunctuated clause** — `"Click here to verify your identity, then send
Rs.500 to Ramesh Kumar to complete the transfer."` (no period until the very
end) — the lazy capture still swallows everything from the first "to" to
the end of the sentence before a second, separate match is ever attempted.
The result is `"Unknown recipient"`, not `"Ramesh Kumar"`.

This is the spec's own explicitly sanctioned fallback ("if no confident
recipient can be extracted, store Unknown"), so it is not a failure against
the request — but it's not the "best" outcome either, and I don't want to
imply the multi-occurrence check in fix #3 solves this class of case in
general. It only helps when clauses are actually separated by punctuation
(`"Click here to verify. Then send Rs.500 to Ramesh Kumar."` → correctly
finds `"Ramesh Kumar"` — added as its own regression case so this boundary
stays visible). Closing the unpunctuated case properly would need real
clause segmentation, not another regex tweak, and risks new false rejections
for the amount of benefit it buys. Left alone; documented; regression-tested
in both directions so the boundary doesn't silently move later.

## Also observed, not changed (out of scope, noted for completeness)
Some rejected-CTA cases fall through to a different, still-imperfect
fragment rather than `"Unknown recipient"` — e.g. `"towards KBC lottery
processing fee"` → `"KBC lottery processing fee"`, and `"due to KYC
expiry"` → `"KYC expiry"`. These are no longer the dangerous case (a scam
instruction rendered as if it were a contact name), but they're still not
a real recipient. Enforcing a stricter recipient *shape* (title-case name or
VPA only) would tighten this further, but real Indian bank SMS routinely
use lowercase or all-caps merchant names ("google pay", "AMAZON PAY"), so a
shape requirement risks rejecting legitimate merchants along with the
remaining garbage. Flagging this rather than quietly tightening it further
without your sign-off, per the same standard as prior patches.
