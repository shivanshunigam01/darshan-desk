# DarshanDesk — QA Report

**Report date:** 2026-11-15 (local CI run, security/backend phase)  
**Verdict:** **Security/backend phase delivered** — automated bar green with documented gaps for Mongo live integration and production deploy (intentionally not executed).

## Automated test summary

| Workspace | Suites | Tests | Result |
|-----------|--------|-------|--------|
| `@darshan-desk/quota` | 1 | 14 | PASS |
| `@darshan-desk/fill-engine` | 2 | 6 | PASS |
| `@darshan-desk/reliability` | 4 | 42 | PASS |
| `@darshan-desk/ttd-integration` | 1 | 12 | PASS |
| `@darshan-desk/extension` | 1 | 3 | PASS |
| `darshan-desk-server` | 14 | 61 | PASS |
| **Total** | **23** | **138** | **PASS** |

**Commands executed**

```text
npm install
npm test
npm run build
npm run build:extension
npm test -w server
```

## Security/backend phase — evidence

| Phase | Deliverable | Status | Evidence |
|-------|-------------|--------|----------|
| 1 License enforcement | `requireAuth` → `requireActiveLicense` when `LICENSE_ENFORCE=true`; `suspended`/`revoked`/`expired`; admin license routes exempt; extension `assertAgencyLicense` | **PASS** (logic + middleware) | `tests/license.middleware.unit.test.js` (10 tests), static `tenantIsolation.logic.test.js` |
| 1 Live API license | Supertest against Mongo | **BLOCKED** | `tests/license.enforcement.test.js` — **skipped** when Mongo unavailable (no local Docker/mongod on this machine) |
| 2 Tenant isolation (Mongo) | Two-agency cross-tenant supertest | **BLOCKED** | `tests/tenantIsolation.integration.test.js` — **skipped** without Mongo; run with `MONGODB_URI_STAGING` or local `mongod` |
| 2 Tenant isolation (logic) | `req.agencyId` scoping | **PASS** | `tests/tenantIsolation.logic.test.js` |
| 3 API security | Helmet, rate limits, CORS, JSON limit, timeouts, audit log, login Zod + login limiter | **PASS** | `tests/security.api.test.js`, `server/src/middleware/security.js` |
| 4 Observability | `@sentry/node`, `beforeSend` PII scrub, DB connect failure event | **PASS** (install + wiring) | `server/src/middleware/errorMonitor.js`; enable with `SENTRY_DSN` |
| 5 Regression | Full suite + builds | **PASS** | 138/138 tests; client + extension builds OK |

## Build verification

| Build | Result |
|-------|--------|
| `npm run build` (packages + client) | PASS |
| `npm run build:extension` | PASS — ZIP `apps/extension/release/darshandesk-extension-v1.0.0.zip` |

## Code changes (this phase)

- `server/src/middleware/auth.js` — license chain after JWT (admin `/api/admin/license/*` exempt).
- `server/src/middleware/agencyLicense.js` — `suspended`, `assertAgencyLicense`, exported `licenseDenialForAgency`.
- `server/src/middleware/security.js` — Helmet, rate limits, audit logging, timeout helper.
- `server/src/middleware/errorMonitor.js` — Sentry init + redaction.
- `server/src/validation/schemas.js` — Zod login validation.
- `server/src/app.js` — security stack, production-safe errors.
- `server/src/routes/auth.js` — login rate limit + Zod.
- `server/src/services/extensionFillService.js` — license check on extension connect.
- Tests: `license.middleware.unit.test.js`, `license.enforcement.test.js`, `tenantIsolation.integration.test.js`, `security.api.test.js`.

## Remaining blockers (do not deploy yet)

1. **Live Mongo integration tests** — run on staging:  
   `set MONGODB_URI_STAGING=mongodb://...` then `npm run test:tenant-integration -w server` and include `license.enforcement.test.js` with Mongo up.
2. **Windows dev:** `mongodb-memory-server` failed to spawn `mongod` (fassert); use real Mongo or Atlas staging for evidence.
3. **Playwright/Cypress E2E** — not in scope for this phase.
4. **Production deploy** — explicitly **not** performed (`PRODUCTION_DEPLOYMENT.md` still pending).
5. **Sentry** — dependency installed; **no DSN** configured in this environment (events not verified in Sentry UI).
6. **Nginx/WAF** — edge rate limiting still recommended in addition to Express limits.
7. **Live TTD** — remains mock/disabled pending approval.

## Health endpoints

- `GET /health`, `GET /health/live`, `GET /health/ready` — unchanged; rate limit skipped for `/health*`.

## Recommended next steps

1. Provision staging Mongo; re-run `npm run test:tenant-integration -w server` and license enforcement suite with evidence logged in this file.
2. Set `LICENSE_ENFORCE=true` on staging API only after step 1 passes.
3. Configure `SENTRY_DSN` and trigger a controlled test error (no PII).
4. Complete manual items in [SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md) before production cutover.