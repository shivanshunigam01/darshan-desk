# Client Acceptance Tests — DarshanDesk

Execute in **staging** (Atlas + HTTPS API + Vercel/Nginx client) before go-live. Record pass/fail and evidence links.

## A. Authentication & tenancy

| ID | Steps | Expected |
|----|-------|----------|
| A1 | Login as `operator@…` | JWT issued; `/api/auth/me` returns `agencyId` |
| A2 | Operator A cannot open Operator B preparation by ID (guessed UUID) | 404 Not found |
| A3 | Revoked license (if `LICENSE_ENFORCE=true`) | 403 `LICENSE_REVOKED` |

## B. Preparation & validation

| ID | Steps | Expected |
|----|-------|----------|
| B1 | Create preparation: account, category, pilgrims, donation | Saved under tenant |
| B2 | Validate without consent | Fails validation |
| B3 | Consent + validate | `validationStatus: passed`; booking attempt created |
| B4 | Policy violation (donation below min) | Clear validation errors |

## C. Quota dashboard

| ID | Steps | Expected |
|----|-------|----------|
| C1 | Open `/srivani/quota` TTD contract mock | Cards show counts + `observedAt` |
| C2 | Scenario `stale_cache` | Stale indicator visible |
| C3 | Scenario `unauthorized` / `rate_limited` | Error state; no crash |

## D. Extension pairing (production API URL)

| ID | Steps | Expected |
|----|-------|----------|
| D1 | Generate pairing token on validated prep | UUID returned |
| D2 | Extension connect with token + API URL | `EXTENSION_PAIR_SUCCESS`, access token |
| D3 | Fill mock form pilgrims step | Field-level results; no auto-submit |
| D4 | Disconnect extension | Server revokes access |
| D5 | Expired access token | 401; operator reconnects |

## E. Booking outcome (no false success)

| ID | Steps | Expected |
|----|-------|----------|
| E1 | After extension fill | Attempt state ≥ `REVIEW_REQUIRED`, **not** `CONFIRMED` |
| E2 | Mock signal "quota exceeded" | `QUOTA_REJECTED`; not confirmed |
| E3 | Record official ref without confirm path | Reference stored; outcome unchanged |
| E4 | Confirm with evidence | `CONFIRMED` only via official reference + evidence |
| E5 | Export diagnostic | Mobile redacted; timeline present |

## F. Security smoke

| ID | Steps | Expected |
|----|-------|----------|
| F1 | API from wrong browser origin | CORS blocked |
| F2 | `/health/ready` when DB down | HTTP 503 |
| F3 | No secrets in browser network tab | No JWT in extension storage beyond session design |

## G. Regression automation (engineering)

| ID | Command | Expected |
|----|---------|----------|
| G1 | `npm test` | 105 tests pass |
| G2 | `npm run build` | Client dist builds |
| G3 | `npm run build:extension` | ZIP created |
| G4 | `npm run health-check -- <staging-api>` | ready: true |

## Sign-off

| Role | Name | Date | Pass? |
|------|------|------|-------|
| Agency operator | | | |
| DarshanDesk engineering | | | |
| Security review | | | |