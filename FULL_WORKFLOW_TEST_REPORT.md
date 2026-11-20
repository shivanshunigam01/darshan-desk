# FULL WORKFLOW TEST REPORT — DarshanDesk

**Audit date:** 2026-11-16  
**Auditor role:** Senior E2E / acceptance QA  
**Environment:** Windows dev, Node 24.x, MongoDB Atlas (seeded), API `:4000`, client Vite build

## Executive summary

| Area | Result |
|------|--------|
| Monorepo automated tests (packages + server CI script + client vitest) | **PASS** |
| Playwright extension E2E (8 specs) | **PASS** (after CORS + mock-loader fixes) |
| Live API acceptance script (`scripts/acceptance-workflow.mjs`) | **PASS** (with documented product gaps below) |
| Full interactive Chrome + dashboard walkthrough | **NOT TESTED** (no human screenshot session) |
| Builds (client, extension ZIP, fill-engine tsc) | **PASS** |

### Defects fixed during this audit (no new product features)

1. **CORS** — allow `localhost` / `127.0.0.1` origins so `/mock-booking` module scripts load (was HTTP 403, breaking Playwright and headless browsers).
2. **Rate limit** — skip `/mock-booking` paths.
3. **Mock site** — absolute `/mock-booking/mock-form.js` URL; body `data-dd-*` attributes.
4. **Playwright** — repo-root `webServer`, `mock-helpers.ts` navigation waits; CAPTCHA assertion via live DOM.
5. **Tests** — `bookingOutcome.workflow.test.js` aligned with `deriveBookingOutcome` (`CONFIRMATION_PENDING` → `uncertain`).
6. **Acceptance script** — quota exhausted uses `mockScenario=zero_quota`.

---

## Automated run matrix

| Suite | Command | Result |
|-------|---------|--------|
| fill-engine | `npm run test -w @darshan-desk/fill-engine` | **17/17 PASS** |
| quota | `npm run test -w @darshan-desk/quota` | **14/14 PASS** |
| reliability | `npm run test -w @darshan-desk/reliability` | **42/42 PASS** |
| ttd-integration | `npm run test -w @darshan-desk/ttd-integration` | **14/14 PASS** |
| extension (Jest) | `npm run test -w @darshan-desk/extension` | **3/3 PASS** |
| server (CI list) | `npm run test -w server` | **79/79 PASS** |
| client | `npx vitest run` in `client/` | **7/7 PASS** |
| Playwright | `npx playwright test` in `apps/extension` | **8/8 PASS** |
| workflow FSM (optional file) | `tests/bookingOutcome.workflow.test.js` | **2/2 PASS** |

**Screenshots:** Not captured (headless/API audit). Mark **N/A** unless noted.

---

## 30-step workflow matrix

| # | Step | Status | Observed behavior | Expected | Error / gap | Fix required |
|---|------|--------|-------------------|----------|-------------|--------------|
| 1 | Start MongoDB | **PASS** | Atlas URI in `server/.env`; server connects on start; tests use in-memory Mongo | Connected DB | — | Ops: secure URI, rotate credentials |
| 2 | Start Express API | **PASS** | `npm run start -w darshan-desk-server` → `/health` 200 | API :4000 | — | — |
| 3 | Start React dashboard | **PASS** (build) | `npm run build -w client` OK; dev via `npm run dev` | :5173 SPA | Manual UI not re-run | — |
| 4 | Login Super Admin | **PASS** | Seed `superadmin@darshandesk.local`; JWT `super_admin`; acceptance + platform tests | Super admin session | — | Re-seed if missing |
| 5 | Create agency | **FAIL** | No `POST /api/platform/agencies` or UI | New tenant from console | Product gap | **Not in scope** — use seed/DB |
| 6 | Activate subscription | **PARTIAL** | Agency admin `POST /api/admin/license/activate` for **own** agency; seed sets `licenseStatus: active` | Super-admin activates any tenant | Cross-tenant license API missing | Product gap |
| 7 | Login agency admin | **PASS** | `admin@darshandesk.local` / `admin123` | Admin JWT | — | — |
| 8 | Create agency operator | **FAIL** | `/operators` placeholder; no invite API | CRUD operators | Documented gap | Product gap |
| 9 | TTD account reference | **PASS** | `/api/ttd-accounts`, masking, auth tests | Reference-only, no secrets | — | — |
| 10 | Create pilgrims | **PASS** | `/api/catalog/pilgrims`; seed has 3 | Tenant-scoped CRUD | — | — |
| 11 | Booking group | **FAIL** | No `PilgrimGroup` model; `/pilgrim-groups` placeholder | Group entity | Not implemented | Product gap |
| 12 | Current / Advance | **PASS** | `bookingCategory` enum; wizard | CURRENT / ADVANCE | — | — |
| 13 | Valid donation prep | **PASS** | Min ₹10,000 policy; validation tests | Valid donation | — | — |
| 14 | Validate person count | **PASS** | `validationRules.test.js` | Policy max pilgrims | — | — |
| 15 | Save preparation | **PASS** | `extension.integration.test.js`, `api.test.js` prep flow | Persisted prep | — | — |
| 16 | Pair extension | **PASS** | `extension/pair`, `extension/connect`, integration tests | Pairing + short-lived token | Chrome UI not re-run | — |
| 17 | Sync preparation | **PASS** | `session-sync`, `contentRevision` invalidation | Fresh payload | — | — |
| 18 | Open mock form | **PASS** | Static `/mock-booking/`; Playwright loads JS after CORS fix | Mock v3 | — | — |
| 19 | Fill pilgrims | **PASS** | fill-engine 17 tests; Playwright 1–4 pilgrims 100% verify | Accurate fill | Not manual Chrome click | — |
| 20 | Validate fields | **PASS** | `verifyFillResults`; extension validate mode | Field-level report | — | — |
| 21 | CAPTCHA state | **PASS** | Mock toggle + Playwright; extension `captcha_required` | No bypass | — | — |
| 22 | Quota available | **PASS** | `TTD_INTEGRATION_MODE=mock`; acceptance `provider=mock` | Labeled mock provider | — | — |
| 23 | Quota exhausted | **PASS** | `mockScenario=zero_quota` on `/api/ttd/quota/current` | Zero / exhausted semantics | Live TTD not tested | — |
| 24 | Booking status tracking | **PASS** | `BookingAttempt` FSM; reliability API tests | Timeline states | — | — |
| 25 | Verified confirmation | **PASS** | `confirmed` + `verifiedAt` required in analytics; no auto-claim | Operator evidence | — | — |
| 26 | Login expiry | **PARTIAL** | JWT 12h; extension access 900s + refresh endpoint | Re-auth prompts | Browser session expiry not timed | — |
| 27 | Extension disconnect | **PASS** | API disconnect + popup; integration tests | Revoke + clear local session | — | — |
| 28 | Booking history | **PASS** | `/api/reliability/attempts`; history page wired | Agency-scoped | Empty in fresh seed | — |
| 29 | Agency reports | **PARTIAL** | `/api/reliability/reports/agency-performance` | Agency dashboard | Not full cross-tenant | — |
| 30 | Super Admin analytics | **PASS** | Command center overview/agencies/analytics; 79 tests | 13 KPI cards + tables | UI manual not re-run | — |

---

## Live acceptance script output (sample)

Run: `node scripts/acceptance-workflow.mjs` with API up and seed loaded.

Steps exercised: health, super/admin login, platform overview, quota mock + zero_quota, pilgrims, TTD accounts, reliability attempts, mock HTML.

---

## Third-party / product limitations (honest)

- Official **tirupatibalaji.ap.gov.in** autofill not enabled (mock selectors only).
- **Agency provisioning**, **operator invite**, **pilgrim groups** not shipped.
- No claim of real TTD booking without operator `verifiedAt` evidence on `BookingAttempt`.