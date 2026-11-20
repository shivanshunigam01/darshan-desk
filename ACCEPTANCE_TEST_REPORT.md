# DarshanDesk — Booking Reliability & QA Acceptance Report

**Module:** `@darshan-desk/reliability` + `/api/reliability` + `/srivani/qa`  
**Date:** 2026-11-15

## Success criteria

| Criterion | Implementation | Status |
|-----------|----------------|--------|
| Supported fields populate accurately | Extension fill report → `POST .../fill-report` → `FORM_FILLED` when all verified | Pass (with extension + mock form) |
| No duplicate submission by app | `duplicateSubmissionGuard` + 409 on second `submissionAttempted` | Pass |
| Errors identified transparently | `errorClass`, `errorReport.reasons`, QA timeline | Pass |
| Sensitive data not in logs/exports | `sanitize.ts` redacts mobile/ID/tokens | Pass |
| Confirmation requires official evidence | `CONFIRMED` transition blocked without `hasOfficialEvidence` | Pass |

## Reference regression: quota display mismatch

**Scenario:** Dashboard showed positive quota (e.g. 42, freshness `stale`). Official message: `Cannot book as quota exceeded`.

**Expected:**

- State → `QUOTA_REJECTED`
- Class → `quota_exhausted`
- Reasons mention stale observation
- `blockSuccessPromotion` and `blockAutoResubmit` = true
- **Not** `CONFIRMED`

**Automated test:** `packages/reliability/tests/reliability.test.js` → `quota exceeded after positive display is not success`

## State machine coverage

States: `PREPARED` … `UNKNOWN_OUTCOME` (16). Transitions enforced via `canTransition()`.

## Error classes (10)

`quota_exhausted`, `stale_quota_observation`, `session_expired`, `booking_category_mismatch`, `invalid_pilgrim_data`, `ineligible_booking_request`, `network_timeout`, `rate_limit`, `unconfirmed_transaction`, `payment_failure`.

## Manual QA steps

1. Create preparation → validate → note preparation ID.
2. **Reliability & QA** → Start reliability tracking.
3. Quota dashboard (optional): note positive quota + stale freshness.
4. Record mock signal with `Cannot book as quota exceeded` → verify `QUOTA_REJECTED`.
5. Export sanitized diagnostic → confirm no raw mobile/ID.
6. Attempt `CONFIRMED` without evidence via API → expect 409 (integration).

## Mock environment

- `http://localhost:4000/mock-booking/` → QA scenario panel (no auto-submit).
- `POST /api/reliability/mock-official-signal` (dev; disabled in production unless `ALLOW_MOCK_SIGNALS=true`).

## Explicit non-goals

- No TTD ticket allocation guarantee.
- No rate-limit bypass or quota evasion.
- No automatic resubmission of uncertain bookings.

## Test totals

```bash
npm run test -w @darshan-desk/reliability
```

- **6** core regression tests (`reliability.test.js`)
- **11** classification matrix (all 10 error classes + success-promotion guard)
- Server: `reliability.api.test.js` (401 on protected routes)