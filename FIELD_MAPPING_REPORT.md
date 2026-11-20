# FIELD MAPPING REPORT — DarshanDesk extension

**Date:** 2026-11-16  
**Scope:** Authorized local mock form only (`mock-srivani-v1`). No production TTD DOM selectors.

## Mapping profile

| Item | Value |
|------|--------|
| Profile ID | `mock-srivani-v1` |
| Form version | `3` (`data-dd-form-version`) |
| URL | `http://localhost:4000/mock-booking/?pilgrims=1-9` |
| Detection | `data-dd-mapping="mock-srivani-v1"` on `body` |

Canonical reference: `apps/extension/SUPPORTED_FIELD_MAPPING.md`.

## Pilgrim fields (row `n`)

| Profile path | DOM selector | Type | Verification |
|--------------|--------------|------|----------------|
| `pilgrims[n].fullName` | `data-dd-field="pilgrim-{n}-fullName"` | Text | Read-back compare |
| `pilgrims[n].dateOfBirth` | `pilgrim-{n}-dateOfBirth` | Date | Read-back |
| `pilgrims[n].age` | `pilgrim-{n}-age` | Number | Read-back |
| `pilgrims[n].gender` | `pilgrim-{n}-gender` | Select | Value + label match (M/F/T/O) |
| `pilgrims[n].idType` | `pilgrim-{n}-idType` | Select | Aadhaar Card, Passport, PAN |
| `pilgrims[n].idNumber` | `pilgrim-{n}-idNumber` | Text | Min length; **not logged in full** server-side |
| `pilgrims[n].mobile` | `pilgrim-{n}-mobile` | Text | 10-digit pattern |
| `pilgrims[n].city` | `pilgrim-{n}-city` | Text | Min length |

## Row binding

- Stable ID: `data-dd-pilgrim-id` on block + `data-pilgrim-index`.
- Server sends `rowMappings: [{ pilgrimId, rowIndex }]` ordered by selection.
- Engine: `mapPilgrimRowsById` before `buildFillPlan`.

## Scalar fields (booking step)

| Profile path | Selector | Auto-fill |
|--------------|----------|-----------|
| `permittedScalars.donationAmount` | `donation-amount` | Yes (when step allows) |
| `permittedScalars.bookingCategory` | `booking-category` | Radio CURRENT/ADVANCE |
| `permittedScalars.preferredDate` | `preferred-date` | Advance only |
| Legal consent | `legal-consent` | **Never** |

## Automated coverage

| Test file | Cases |
|-----------|--------|
| `packages/fill-engine/tests/mockForm.e2e.test.js` | 1–4 pilgrims, passport, bad gender, CAPTCHA detect |
| `packages/fill-engine/tests/fillEngine.test.js` | Plan build, consent skip, patterns |
| `apps/extension/tests/security.test.js` | Host allowlist only |

## Gaps

- No approved mapping for `tirupatibalaji.ap.gov.in` DOM (operator login + manual entry only).

## Playwright (mock + fill-engine)

- `apps/extension/e2e/fill-accuracy.playwright.spec.ts` — 1–4 pilgrim 100% verify loop, CAPTCHA fixture, refresh redetect.
- `apps/extension/e2e/fill-mock.playwright.spec.ts` — DOM smoke tests.
- Run: `npm run test:e2e -w @darshan-desk/extension` (starts API via `playwright.config.ts` webServer).