# DarshanDesk — SRIVANI Booking Preparation

MERN SaaS module for agency operators to prepare SRIVANI trust bookings against **versioned, configurable** TTD policy snapshots, validate pilgrim groups, pair a browser extension, and record **verified** outcomes only when official evidence is supplied.

> Policy numbers in `server/src/fixtures/ttdPolicySample.json` are **sample fixture data** (min donation ₹10,000, current max 4 pilgrims, advance max 9, reporting 04:00 PM, release 11:03:00). Replace via admin policy API before production use.

## Quick start (extension-first)

1. MongoDB locally or Atlas — set `MONGODB_URI` in `server/.env`.
2. From repo root:
   ```bash
   npm install
   npm run dev
   ```
3. API: http://localhost:4000  
4. Load extension: `apps/extension/dist` in Chrome → sign in / register in popup.

Legacy dashboard: `npm run dev:legacy-dashboard` (client on :5173).

**Production API on EC2:** [EC2_UBUNTU_NGINX.md](./EC2_UBUNTU_NGINX.md)  
**Extension download page:** `apps/landing/` (serve with Nginx — see same guide).

**Demo login:** `operator@darshandesk.local` / `operator123`  
**Admin (policy CRUD):** `admin@darshandesk.local` / `admin123`

## Workflow (1–11)

| Step | Where |
|------|--------|
| Operator login | `/login` |
| TTD account reference | Preparation page |
| SRIVANI trust | Fixed category in module |
| Donation amount | Validated vs active `TTDPolicySnapshot` |
| Current / Advance | Pilgrim limits from policy |
| Saved pilgrims | Catalog CRUD `/api/catalog/pilgrims` |
| Validation + consent | `POST .../consent`, `POST .../validate` |
| Extension pairing | `POST .../extension/pair` + load `extension/` in Chrome |
| Official site | Operator only — extension assists permitted fields |
| Declarations / pay | Not automated |
| Verified outcome | `POST .../record-outcome` with evidence |

## Data models

- `BookingPreparation` — `server/src/models/BookingPreparation.js`
- `TTDPolicySnapshot` — `server/src/models/TTDPolicySnapshot.js`

## Tests

```bash
npm test
```

## Production / operations

- [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) — EC2, PM2, Nginx, Vercel, Atlas
- [SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md)
- [EXTENSION_PUBLISHING.md](./EXTENSION_PUBLISHING.md)
- [QA_REPORT.md](./QA_REPORT.md) — **read before claiming go-live**
- [CLIENT_ACCEPTANCE_TESTS.md](./CLIENT_ACCEPTANCE_TESTS.md)

## Booking Reliability & QA

- UI: `/srivani/qa`
- API: `/api/reliability/*`
- State machine + error classification: `packages/reliability/`
- Acceptance report: `ACCEPTANCE_TEST_REPORT.md`

## SRIVANI Quota Dashboard

- UI: `/srivani/quota` (manual refresh only — no polling)
- API: `GET /api/quota/dashboard?provider=mock|manual|approved_official`
- Typed core: `packages/quota` (`QuotaSummary`, `QuotaDataProvider`, providers + tests)
- Build quota package: `npm run build -w @darshan-desk/quota`

## Chrome extension (MV3)

- Source: `apps/extension/`
- Fill engine (typed field mapping): `packages/fill-engine/`
- Mock supported form: `http://localhost:4000/mock-booking/`
- Build: `npm run build:extension` → `apps/extension/dist` + `apps/extension/release/*.zip`
- Install: see `apps/extension/INSTALLATION.md`

Legacy stub in `extension/` is superseded by `apps/extension`.

## API overview

- `POST /api/auth/login`
- `GET /api/policy/active` — rules for UI hints
- `POST /api/policy` — admin: new snapshot
- `POST /api/policy/:policyVersion/activate`
- `GET|POST|PATCH|DELETE` preparations under `/api/preparations`
- `GET /api/catalog/ttd-accounts`, `/api/catalog/pilgrims`