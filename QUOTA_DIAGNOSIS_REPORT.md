# Quota diagnosis report — booking-stage HTTP semantics

Date: 2025-11-25  
Context: Operator recording + DevTools observation of  

`POST /dms/srivaniCurrentDayDarshanBooking` → **HTTP 200** with body  
`{"error":"Cannot book as quota exceeded"}`

## Verified findings (code + tests)

| Finding | Status |
|---------|--------|
| HTTP 200 + JSON `error` is **rejection**, not success | **Implemented** (`bookingStageResponse.ts`) |
| Workflow status **QUOTA_REJECTED** | **Implemented** |
| Official message preserved verbatim | **Yes** (`Cannot book as quota exceeded`) |
| Payment Ready / Booking Confirmed **not** inferred from HTTP 200 or navigation alone | **Yes** (`blockPaymentReady`, `blockBookingConfirmed`) |
| Extension does **not** intercept TTD cookies/tokens (no `webRequest`) | **Verified** (`security.test.js`) |
| Visible quota snapshot + timestamp in diagnostic timeline | **Yes** |
| Pilgrim count, loading overlay, outcome code in timeline | **Yes** |
| Auto-retry after rejection blocked | **Yes** (service worker + `blockAutoResubmit`) |

### Regression test (exact recording)

`packages/reliability/tests/bookingStageResponse.test.js`:

- Input: `200` + `{ error: "Cannot book as quota exceeded" }`
- Output: `workflowStatus: QUOTA_REJECTED`, `bookingAccepted: false`, `blockPaymentReady: true`

### Extension UI

- **Monitor** shows workflow, HTTP 200+error banner, outcome, timeline.
- **Fill** payment hint suppressed when `QUOTA_REJECTED` or `blockPaymentReady`.

## How diagnostics receive booking-stage HTTP data

| Source | Permitted? | Used? |
|--------|------------|--------|
| Visible page text / alerts | Yes | Always |
| Mock fixture `data-dd-booking-stage-response` | Yes (dev/E2E) | Yes |
| Operator-exported classification via backend | Yes | Supported on server/reliability APIs |
| Chrome `webRequest` interception of TTD session | **No** | Not implemented (by design) |

The recording you shared is classified by **`classifyBookingStageHttpResponse`** when that payload is provided through an **approved** channel (mock attribute, backend audit export, or future operator-pasted sanitized JSON in settings — not network sniffing).

## Unresolved hypotheses

1. **Race:** Payment summary rendered before XHR error surfaced — extension may briefly show `payment_summary` phase; outcome should update when error text or stage fixture appears.
2. **Live DOM:** Error only in toast not in `body` text — may need additional label selectors (requires redacted HTML samples).
3. **Causal link:** Whether any extension action affected the POST body — **no evidence** in code; fill does not submit booking endpoints.

## Extension contribution to failure

**Assessment: Did not cause quota rejection.**

- No calls to `srivaniCurrentDayDarshanBooking` from extension code.
- Pilgrim fill does not submit Continue or payment.
- Quota rejection is consistent with **TTD server allocation** after manual Continue.

## Bypass requests

**Will not implement** quota bypass, forged bookings, CAPTCHA/payment evasion, or hidden API replay. That violates TTD controls and project security rules.

## Test run

See `BOOKING_FAILURE_TEST_REPORT.md` / latest CI section after `npm run test` on reliability, fill-engine, and extension workspaces.