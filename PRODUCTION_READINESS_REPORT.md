# PRODUCTION READINESS REPORT — DarshanDesk

**Date:** 2026-11-16  
**Verdict:** **NOT PRODUCTION-READY** for full multi-tenant SaaS operations without addressing gaps below. **READY** for controlled pilot: single/agency demo + mock booking assist + reliability tracking.

## Build matrix (this audit)

| Component | Build / test | Status |
|-----------|----------------|--------|
| React client | `npm run build -w client` | **PASS** |
| Node API | Packages build via `npm run build` | **PASS** (ttd-integration builds after tsconfig fix) |
| Chrome extension | `npm run build:extension` | **PASS** + ZIP |
| Monorepo `npm test` | Partial | Client + packages PASS; server script 66/68; optional integration files timeout |
| Playwright | — | **NOT INSTALLED** |

## Security & compliance (existing)

| Control | Status |
|---------|--------|
| JWT auth + tenant filters on agency routes | Implemented / tested |
| License enforcement (`LICENSE_ENFORCE`) | Implemented / tested |
| Super admin platform routes | `requireSuperAdmin` + audit log |
| No portal passwords in MongoDB | Model design + API stripping |
| Rate limits / helmet / audit JSON logs | `security.js` |
| Sentry hook | Present in error monitor |

**Pre-prod checklist (operator):** rotate `JWT_SECRET`, set `CLIENT_ORIGIN` / `CORS_ORIGINS`, disable demo seed in production (`SEED_ON_START`).

## Functional gaps blocking “complete SaaS” workflow

| Gap | Impact |
|-----|--------|
| No super-admin **create agency** API/UI | Steps 5–6 manual via DB seed only |
| No **operator provisioning** API | Step 8 |
| No **pilgrim groups** entity | Step 11 |
| Playwright E2E not in CI | Extension UI regression risk |
| Some server integration tests timeout | CI noise without Mongo memory server binary cached |
| Disk space on dev machine historically caused `ENOSPC` | Build/test instability — monitor C: free space |

## Data & integration

- Live TTD quota: **configurable** but **not live-verified** in this audit.
- Extension autofill: **mock site only** until approved selector catalog exists.
- Booking confirmation: **operator-attested** `BookingAttempt` outcomes — no fabricated official receipts.

## Recommended release phases

1. **Pilot A:** Demo agency, mock quota, mock form extension, reliability lab — **supported now**.
2. **Pilot B:** Approved quota read-only with real token in staging — requires env + ops approval.
3. **GA SaaS:** Agency CRUD, operator invites, billing, Playwright CI, hardened integration test harness.

## Files produced by this audit

- `FULL_WORKFLOW_TEST_REPORT.md`
- `FIELD_MAPPING_REPORT.md`
- `LIVE_DATA_INTEGRATION_REPORT.md`
- `EXTENSION_TEST_REPORT.md`
- `PRODUCTION_READINESS_REPORT.md`