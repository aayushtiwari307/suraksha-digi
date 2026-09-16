# SurakshaDigi Backend — Patch v4

Both reported bugs reproduced, both fixed, completeness pass done. One of the
two had a **root cause deeper than the report identified** — details below.

---

## 1. Missing-alert recovery never ran on the real Android path — FIXED

**Confirmed exactly as reported.** `processIncomingSms` in
`transactionController.js` had its own duplicate-check that ran *before*
`processTransaction`, used a raw `Alert.findOne`, had no recovery step, and
returned early. The v3 `ensureAlertForExisting` fix was real but unreachable
from the path Android traffic actually uses.

### What I did — and one course-correction worth flagging

My first attempt was to **delete** the early return entirely and let
everything flow through `processTransaction`. I reversed that decision after
checking what the early return was actually protecting:

```js
const regexNeedsFallback = parsed.success &&
  (parsed.data.recipient === 'Unknown recipient' || parsed.data.transactionType === 'unknown');
if (!parsed.success || regexNeedsFallback) { await parseTransactionSmsWithGemini(rawMessage); ... }
```

The Gemini fallback fires whenever the regex parser yields an unknown
recipient or unknown transaction type — which is **exactly the profile of a
scam SMS**. Removing the early return would have meant every Android retry of
a scam SMS triggers a fresh Gemini API call, and a Gemini outage would turn a
harmless duplicate into a 422 that the phone then retries again. That's a
worse failure mode than the bug being fixed.

**Final fix**: keep the early return for its genuine purpose (skip re-parsing),
but delegate to a single shared, exported function in `fraudService.js`:

```js
const resolveExistingDeviceEvent = async ({ deviceId, eventId, elder = null }) => { ... }
```

`processIncomingSms` now calls it, and `processTransaction`'s own device-event
branch was refactored to call it too — so the lookup *and* the recovery now
exist in exactly one place, reachable from every caller. The optional `elder`
parameter lets `processTransaction` pass the elder it already loaded instead
of re-fetching it.

---

## 2. Negation scoping suppressed real scam instructions — FIXED, root cause was deeper

**Confirmed.** Both reported messages scored LOW when they should be HIGH.

### Correction to the report's diagnosis

The report attributed both failures to the missing pivot-word reset. That's
correct for the `"but"` case but **not sufficient for the `"however"` case**.
I implemented the pivot-word fix exactly as specified and the `"however"` case
still failed. The actual root cause:

```
Text: "For your safety we never request remote access, however you must
       provide remote access immediately to unlock your account."
ALL occurrences of /remote access/: [33, 73]
pattern.exec() returns only index 33 — which is genuinely negated.
The code then `continue`s and skips the whole pattern, never examining
index 73, which is the real demand.
```

`findMatchedKeywords` only ever tested the **first** occurrence of each
pattern. A negated first mention caused the entire pattern to be discarded,
hiding any un-negated occurrence later in the message. No pivot-word rule can
fix that, because the pivot logic never gets to run on the second occurrence.

**Both fixes were required and both are in:**
1. `NEGATION_SCOPE_RESET` — the lookback now resets at `but`, `however`,
   `although`, `though`, `except`, `yet`, `instead`. `or` is deliberately
   excluded, as specified, so the v3 compound-warning case still works.
2. **All occurrences are now checked**, not just the first. A pattern counts
   if *any* occurrence of it is un-negated. This is the fix the `"however"`
   case actually needed.

### Regression-test honesty note
Also worth recording: for the `"but"` case, the narrower v2 window genuinely
*would* have caught it — so that one was a true regression introduced by v3's
scope-widening. The `"however"` case is different: it only became reachable
because v3 added `remote access` to the negation-sensitive set at all (v2 had
no guard on that pattern, so it matched unconditionally — while also
false-positiving on legitimate warnings). Different provenance, both real.

---

## 3. Completeness pass

### Audit for other parallel implementations of the same check

| Checked | Finding |
|---|---|
| `Transaction.findOne` duplicate-detection sites | **Was 2 (fraudService + transactionController), now 1.** All duplicate detection lives in `fraudService.js`. |
| `Alert.findOne` for recovery | **1** — inside `ensureAlertForExisting`. The other hit in `alertController.js:160` is fetching an alert for the feedback endpoint, a different concern, correctly not consolidated. |
| Alert creation | **1 route** — every caller (`alertController`, `missedMedicationJob`, `fraudService`) goes through `createAlertWithScoreUpdate`. No direct `Alert.create` outside `alertService.js`. |
| Safety-score mutation | **1** — only `alertService.js` writes `safetyScore`; every other hit is a read for a response body. |
| Velocity / recent-window calculation | **1** — `countRecentHistory` (consolidated in v3). |
| Scam-pattern / negation matching | **1** — only `fraudSignals.js`. The other two files that mention `matchedKeywords` just consume the output (one formats a reason string, one is a schema field). |

Also noted, **not** changed: `createAlertWithScoreUpdate` wraps its work in
`session.withTransaction`, which requires MongoDB to run as a replica set. On
a standalone `mongod` this throws. That's pre-existing and is a deployment
consideration, not a regression — but it's worth knowing before a demo, since
a standalone local Mongo would make alert creation fail outright.

### New test against the real entry point

`scripts/device-sms-endpoint.test.js` calls the actual exported
`ingestDeviceSms` handler mounted on `POST /api/devices/sms-event` — not
`processIncomingSms`, not `processTransaction`.

**I verified this test actually catches the v3 bug rather than just passing
against the fix.** Reverting `transactionController.js` to the v3
implementation and re-running it:

```
PASS | Retry is reported as a duplicate | status=200
FAIL | >>> Missing HIGH alert IS recovered on the real Android path | alerts=0
FAIL | Recovered alert is returned in the HTTP response
FAIL | Recovered alert has high severity
FAIL | Further retries stay idempotent (no duplicate alerts) | alerts=0
Passed: 4/8
```
Against v4: 8/8. A test that passes both before and after the fix proves
nothing; this one does not.

### Bug #2 regression tests
Added to `fraud-engine.test.js`: both pivot cases (expected `high`), the
`"or"` compound-warning control (expected `low`), and a benign `"but"`
message with no scam pattern (expected `low`).

### No existing expectation was edited
Verified by diffing case-name→expected pairs against the original v2 zip:
all **43 original cases retain their original expected results**; the 8
additions are purely new. Nothing was quietly re-expected to make a suite go
green.

### Optional `{ new: true }`
Applied — it was a one-line change, as anticipated.

---

## 4. Full test output

```
Fraud engine:        51/51   TP=13 FP=0 FN=0 TN=38  (precision 100%, recall 100%, FPR 0%)
Password reset:        6/6
Fraud service:        14/14
Device pairing race:   3/3
Device SMS endpoint:   8/8   (new)
------------------------------------
TOTAL:                82/82
```
`node --check` clean on every file under `src/` and `scripts/`.

---

## 5. Honest remaining trade-offs

**Precision/recall of 100% here means "passes its own self-authored
regression suite."** It is not a real-world accuracy measurement, and should
not be described as one.

**Negation gaps that remain, tested in both directions:**
- `"Under no circumstances should you share your OTP"` → still HIGH (false
  positive). There is no negation word anywhere in that sentence. Unchanged
  from v3, still judged not worth a special case.
- Legitimate RBI re-KYC notices → still HIGH. Unchanged; this is the known
  structural limitation, not a regex miss.
- I probed my own fix for *new* gaps in both directions (pivot words
  `though`/`instead`, negation in a prior sentence, trailing `but` in a
  warning, compound `or` warnings). All behaved correctly. The only failures
  are the two pre-existing documented ones above.

**A duplication I found and deliberately did not consolidate:**
`alertService.createAlertWithScoreUpdate` performs its own
`Alert.findOne({ sourceType, sourceId })` idempotency check inside its Mongo
transaction. That looks like a third copy of "does this alert exist," but it
is a *different* concern — a create-time race guard inside a transaction,
not a recovery path. It is what makes `ensureAlertForExisting` safe to call
concurrently. Merging the two would weaken both. Left as-is intentionally.

**Structural limit of the pivot approach:** it assumes negation scope ends at
a contrastive conjunction. A message that negates *after* the instruction
("Share your OTP — actually, never mind, we'd never ask that") is not
handled, and won't be by any lookback-only design. Not seen in real SMS, not
chased.
