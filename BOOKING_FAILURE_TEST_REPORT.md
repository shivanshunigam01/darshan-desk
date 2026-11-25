# Booking failure test report

Date: 2025-11-25  
Scope: Quota rejection diagnostics, duplicate prevention, outcome classification  

## Automated results

| Suite | Command | Result (2025-11-25, latest run) |
|-------|---------|----------------------------------|
| `@darshan-desk/reliability` | `npm run test -w @darshan-desk/reliability` | **53/53 passed** (incl. `bookingStageResponse` regression) |
| `@darshan-desk/fill-engine` | `npm run test -w @darshan-desk/fill-engine` | **25/25 passed** (HTTP 200 + error fixture) |
| `@darshan-desk/extension` | `npm run test -w @darshan-desk/extension` | **3/3 passed** (security) |

## Scenario matrix (local mock)

Use `http://localhost:4000/mock-booking/` → **confirm** step → **Simulate official check**.

| # | Scenario key | Expected `outcomeCode` | Verified (unit) | Verified (manual UI) |
|---|--------------|------------------------|-----------------|----------------------|
| 1 | `quota_display_rejected` | `QUOTA_REJECTED` + mismatch | **Yes** | Not run |
| 2 | `quota_exhausted` | `QUOTA_REJECTED` | Partial (message variant) | Not run |
| 3 | `payment_pending` | `PAYMENT_PENDING` | **Yes** | Not run |
| 4 | `loading_stuck` | loading / assist block | Monitor flags | Not run |
| 5 | `duplicate_guard` | info only | SW mutex unit | Not run |
| 6 | `session_expired` | `SESSION_EXPIRED` | **Yes** | Not run |
| 7 | `eligibility_error` | `ELIGIBILITY_REJECTED` | **Yes** | Not run |
| 8 | `payment_gateway_error` | `UNKNOWN_OUTCOME` / payment fail class | Partial | Not run |
| 9 | `unknown_outcome` | `UNKNOWN_OUTCOME` | Partial | Not run |
| 10 | `confirmed` | `CONFIRMED` | **Yes** | Not run |

## What was verified

- “Cannot book as quota exceeded” with displayed quota **183** → `QUOTA_REJECTED`, `quotaDisplayMismatch: true`, auto-resubmit blocked.  
- `Success: 0` counter alone does **not** yield `CONFIRMED`.  
- Timeline event deduplication.  
- Fill report includes `bookingConfirmed: false`.  
- Extension security tests still pass (manifest / hosts).  

## What remains unverified

- Live TTD DOM variants (label layout changes).  
- End-to-end Playwright on all 10 mock scenarios.  
- Whether a specific production failure was caused by extension (requires correlating timeline with operator actions on official site).  

## Extension contribution assessment

For the reported **quota exceeded after manual Continue**:

| Hypothesis | Assessment |
|------------|------------|
| Extension auto-submitted booking | **Rejected** — no auto-submit path |
| Extension altered donation/pilgrim after fill | **Unlikely** — only pilgrim fields; no post-Continue writes |
| Extension duplicate Continue clicks | **Rejected** — `autoContinue` off |
| Extension mis-reported success | **Rejected** for booking; field fill success is separate |
| TTD genuine quota rejection | **Consistent** with message and mismatch logic |

## Recommended operator procedure after `QUOTA_REJECTED`

1. Read official message verbatim on TTD — do not retry via extension automation.  
2. Open **Monitor** — confirm `QUOTA_REJECTED` and timeline.  
3. Refresh official quota observation; wait for release window if policy allows.  
4. Start a **new** preparation revision if data changed — do not assume prior fill session valid for another attempt.  