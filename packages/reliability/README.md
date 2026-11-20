# @darshan-desk/reliability

Production booking **outcome** tracking — state machine, error classification, sanitized diagnostics.

## Reference scenario

Positive **quota dashboard** + stale freshness → official message **"Cannot book as quota exceeded"** → `QUOTA_REJECTED` / `quota_exhausted` (never `CONFIRMED`, no auto-resubmit).

## Outcome workflow (14 states)

`PREPARED` → `FORM_READY` → `FORM_FILLED` → `REVIEW_REQUIRED` → `SUBMITTED` → `PAYMENT_PENDING` → `CONFIRMATION_PENDING` → `CONFIRMED`

Terminals / failure: `QUOTA_REJECTED`, `RATE_LIMITED`, `SESSION_EXPIRED`, `VALIDATION_FAILED`, `UNKNOWN_OUTCOME`, `FAILED`

Legacy aliases (`FORM_VALIDATED`, `SUBMISSION_IN_PROGRESS`, etc.) normalize via `normalizeOutcomeState()`.

## Rules enforced in code

1. Form fill ≠ completed booking  
2. Submit click ≠ confirmed booking  
3. Payment ≠ automatic darshan ticket  
4. `CONFIRMED` requires verified official reference  
5. Timeouts → `UNKNOWN_OUTCOME`  
6. No automatic resubmit on uncertain outcomes  
7. Genuine quota rejection preserved  

## Error classes (10)

`classifyBookingError()` in `src/classify.ts` — see `OPERATOR_EXPLANATIONS` in `src/outcomeStates.ts`.

## UI & API

- QA lab: `/srivani/qa`
- **Booking history & reports:** `/srivani/history`
- API: `/api/reliability/*`
- Acceptance: `ACCEPTANCE_TEST_REPORT.md` (repo root)

## Tests

```bash
npm run test -w @darshan-desk/reliability
```

Includes `workflow-states.test.js`, `workflow-e2e.test.js`, and classification matrix (42 tests).