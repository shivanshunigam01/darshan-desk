# DarshanDesk — Integration Status

**Repository:** `C:\Users\Admin\Desktop\TTD`  
**Lead integration pass:** TTD SRIVANI data adapter (`@darshan-desk/ttd-integration`) — **implemented** (additive; existing modules retained).

## Working frontend routes

| Route | Page | Status |
|-------|------|--------|
| `/login` | Login | Working |
| `/srivani/prepare`, `/srivani/prepare/:id` | SRIVANI preparation | Working |
| `/srivani/status/:id` | Booking status / verified outcome | Working |
| `/preparations` | Preparation CRUD list | Working |
| `/srivani/quota` | Quota information dashboard | Working — includes **TTD contract adapter** provider |
| `/srivani/qa` | Booking reliability & QA | Working |

## Existing Express routes

| Prefix | Purpose |
|--------|---------|
| `GET /health` | Health check |
| `/api/auth` | Login, session |
| `/api/catalog` | TTD account refs, pilgrims |
| `/api/policy` | `TTDPolicySnapshot`, UI reference |
| `/api/preparations` | Booking preparation CRUD, extension pairing |
| `/api/quota` | Legacy quota providers (mock/manual/approved_official) |
| `/api/reliability` | QA attempts, classification, diagnostics |
| **`/api/ttd/*`** | **New — contract-aligned TTD adapter (this pass)** |
| `GET /mock-booking/*` | Local mock form (extension dev) |

## MongoDB models

| Model | File |
|-------|------|
| Agency, Operator, TtdAccountReference, Pilgrim | `server/src/models/index.js` |
| BookingPreparation | `server/src/models/BookingPreparation.js` |
| TTDPolicySnapshot | `server/src/models/TTDPolicySnapshot.js` |
| ManualQuotaObservation | `server/src/models/ManualQuotaObservation.js` |
| ExtensionConnection | `server/src/models/index.js` |
| BookingAttempt (reliability) | `server/src/models/BookingAttempt.js` |

## Extension modules

| Module | Path |
|--------|------|
| Chrome MV3 extension | `apps/extension/` — pairing + short-lived access tokens + E2E mock form (`SUPPORTED_PAGES.md`) |
| Fill engine | `packages/fill-engine/` |
| Mock booking site | `apps/mock-booking-site/` |

## Authentication

- JWT bearer (`server/src/middleware/auth.js`), agency-scoped `req.agencyId`
- Demo operators via `server/src/seed.js`
- TTD third-party credentials **never** exposed to client; adapter runs server-side only

## Existing automated tests

| Package / area | Tests |
|----------------|-------|
| `@darshan-desk/quota` | 14 |
| `@darshan-desk/fill-engine` | 4 |
| `@darshan-desk/reliability` | 17 |
| `@darshan-desk/extension` | 3 security |
| `darshan-desk-server` | validation, quota auth, extension, reliability, srivani policy fixture |
| **`@darshan-desk/ttd-integration`** | **12** |

## New: TTD integration layer

| Component | Location |
|-----------|----------|
| Types, Zod schemas, providers | `packages/ttd-integration/src/` (mirrors `integrations/ttd/`) |
| HTTP routes | `server/src/routes/ttd.js` |
| Bridge to quota UI | `server/src/services/ttdDashboardBridge.js` |

**Observed API host (config only):** `https://tirupatibalaji.ap.gov.in` — set via `TTD_API_BASE_URL`. Not proof of unrestricted integration authorization.

### Reference contracts (mock fixtures + approved path map)

1. `GET /common/getAllCountryDetails`
2. `GET /user/getUserContext`
3. `GET /common/getUserDetail/{userId}`
4. `GET /dms/getnoOfPersons/{amount}`
5. `GET /dms/darshansummarySrivaniCurrentDay`
6. `GET /eDonation/trustsandsubtrusts`

## Missing / gaps (honest)

| Gap | Notes |
|-----|-------|
| Live TTD approved integration | `ApprovedProvider` disabled until `TTD_INTEGRATION_ENABLED=true` + server auth config |
| Live DOM field mapping | Extension uses `mock-srivani-v1` only |
| Multi-tenant TTD credential vault | Env-based server config only (no shared browser sessions) |
| Automated E2E against live TTD | Intentionally omitted — mock + manual observation |
| Duplicate quota systems | `/api/quota` (legacy) and `/api/ttd` (contract adapter) coexist — dashboard **TTD contract adapter** uses `/api/ttd/quota/current` |
| Live approved calls | Require `TTD_INTEGRATION_ENABLED=true` plus server-side token; uses `TTD_API_BASE_URL=https://tirupatibalaji.ap.gov.in` |

## Configuration

See `server/.env.example` and `packages/ttd-integration/CONFIGURATION.md`.