# Quota error diagnosis — DarshanDesk extension

## Situation you described

- Pilgrim fill succeeded (field assist only).
- Operator clicked **Continue** manually when enabled.
- TTD showed payment summary, then **"Cannot book as quota exceeded"**.
- Prior snapshot: Available quota **183**, Payment pending **317**, Success **0**.

**Interpretation:** The status bar is an **observation**, not a reservation. High “available” counts can coexist with **server-side rejection** when inventory is contested, stale, or already allocated. **Payment pending** counts other in-flight bookings — not your confirmed ticket.

## Task 1 — Extension audit (code review)

| Area | Finding | Extension contributed? |
|------|---------|----------------------|
| **fill-engine / domFill** | Writes pilgrim fields only; `duplicateSessionKey` skips re-fill same session; no submit | **No** booking submit |
| **liveSrivaniAssist** | `waitAndClickContinue` / `humanClick` only if `autoContinue === true` (default **false**) | **No** auto-Continue in default config |
| **fill-content** | Fill reports `success` = **field verification**; `bookingConfirmed: false` | Does **not** claim TTD booking |
| **pageMonitor** | Read-only DOM; MutationObserver on Continue state | **No** quota bypass |
| **page-monitor-content** | Passive Continue click listener (diagnostics only) | **No** clicks |
| **Payment assist** | Gateway highlight only when opted in; Pay Now manual | **No** payment automation |
| **service-worker** | Blocks concurrent fill/assist; blocks assist after `QUOTA_REJECTED` / `blockAutoResubmit` | Prevents **extension** duplicate actions |
| **Stage detection** | `payment_summary` from visible text/URL; errors override “ready” | Loading ≠ confirmed navigation |
| **Success reporting** | Monitor requires explicit confirmation copy for `CONFIRMED`; `Success: 0` is **not** confirmation | **No** false success on counter alone |

### What was **not** found

- Hidden TTD booking API calls from the extension  
- Repeated clicks on disabled Continue (auto path disabled)  
- Automatic retry after quota rejection  
- Rewriting official error text  

### Residual risks (operator / TTD)

- Operator may click Continue while extension **payment assist** runs if enabled — assist is blocked during loading and after `QUOTA_REJECTED`.  
- Stale quota display on TTD can mislead **humans**; extension now flags `quotaDisplayMismatch`.  

## Task 2 — Error classification

Implemented in `@darshan-desk/reliability` (`officialOutcome.ts`) and surfaced on monitor snapshots:

| Code | When |
|------|------|
| `QUOTA_REJECTED` | e.g. “Cannot book as quota exceeded” (verbatim line preserved) |
| `ELIGIBILITY_REJECTED` | Eligibility / not eligible copy |
| `SESSION_EXPIRED` | Session expired messages |
| `VALIDATION_FAILED` | Validation / invalid field messages |
| `RATE_LIMITED` | Rate limit / 429 copy |
| `PAYMENT_PENDING` | Payment pending (not success) |
| `NETWORK_ERROR` | Network / timeout copy |
| `UNKNOWN_OUTCOME` | Unclassified official message |
| `CONFIRMED` | Explicit confirmation phrases only |

Official messages are **not** rewritten. Quota rejection is **never** promoted to success.

## Task 3 — Safe diagnostics

`bookingDiagnostics.ts` builds a **sanitized timeline**:

- Booking stage, timestamp, route  
- Quota snapshot (counts/times only)  
- Continue readiness + loading flag  
- `outcomeCode`, `confirmationStatus`  
- Redacted error line (`redactMessage` — no IDs/tokens)  

Not collected: passwords, cookies, CAPTCHA, full ID numbers, payment credentials.

View in extension **Monitor** tab (timeline details) or content script `GET_DIAGNOSTIC_TIMELINE`.

## Task 4 — Duplicate prevention

- `extensionActionInFlight` mutex for fill vs assist  
- `assertPageAssistAllowed()` during official loading after Continue  
- Assist blocked when `outcomeCode === 'QUOTA_REJECTED'` or `blockAutoResubmit`  
- `autoContinue` default **false**; no hidden booking POSTs  

## Verdict for your failure

**Most likely:** TTD **server-side quota rejection** after operator-driven Continue — **not** caused by extension field fill. Displayed **183** available does **not** prove allocation; **317** payment pending indicates contention.

**Unverified without:** server-side TTD logs, exact timestamp correlation, HAR/network capture on official domain (not performed in this repo).

## Files touched (this diagnosis pass)

- `packages/reliability/src/officialOutcome.ts`  
- `packages/fill-engine/src/bookingDiagnostics.ts`  
- `apps/extension/src/content/page-monitor-content.ts`  
- `apps/extension/src/background/service-worker.ts`  
- `apps/mock-booking-site/mock-form.js` (10 QA scenarios)  