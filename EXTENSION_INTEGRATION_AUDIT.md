# Extension integration audit (DarshanDesk MV3)

**Date:** 2026-11-16  
**Scope:** Dashboard ↔ API ↔ extension ↔ `@darshan-desk/fill-engine` ↔ local mock form (`mock-srivani-v1`)

## Architecture (single source of truth)

| Layer | Responsibility |
|-------|----------------|
| `BookingPreparation` (MongoDB) | Canonical `preparationId`, pilgrims, donation, category, `contentRevision`, `validationStatus` |
| `GET /api/preparations/extension/fill-payload` | Fresh pilgrim profiles + `rowMappings` + audit |
| Extension service worker | Pairing token, short-lived access JWT, revision-aware cache invalidation |
| Content script | DOM fill + read-back verification on **supported pages only** |
| `packages/fill-engine` | Selector mapping, dropdown matching, CAPTCHA detection (no bypass) |

Pilgrim edits via `PATCH /api/catalog/pilgrims/:id` call `bumpPreparationsUsingPilgrim` → `contentRevision++` → extension must sync before fill.

## Repaired / completed disconnects

| Issue | Fix |
|-------|-----|
| Operator name blank in popup | API uses `displayName` (was `name`) |
| Stale payload after dashboard edit | Sync before every fill; clear cache when `contentRevision` changes |
| Fill reported success when sync fails | Service worker returns `SYNC_FAILED` if fill-report HTTP fails |
| Unvalidated preparation fill | `fill-payload` returns 403 if `validationStatus !== 'passed'` |
| ID numbers in server logs | `sanitizeExtensionFillReport` masks `*idNumber` fields |
| Async reliability 404 | `asyncRoute` on reliability handlers (tenant isolation) |

## Popup (MV3)

`apps/extension/src/popup/App.tsx` — agency, operator, TTD account, category, donation, pilgrim count, preparation status + revision, last synchronized, **Fill form**, **Validate fields**, **Open official website**, **Disconnect**, field-level results.

## Security boundaries (unchanged)

- No OTP, password, CAPTCHA tokens, payment, declaration auto-fill, or official submit.
- CAPTCHA: detect only → operator message.
- Official `tirupatibalaji.ap.gov.in` — no approved DOM mapping in this release.

## Tests

| Suite | Path |
|-------|------|
| Fill engine (1–4 pilgrims, gender, passport, CAPTCHA, stale profile) | `packages/fill-engine/tests/mockForm.e2e.test.js` |
| Extension API + auth | `server/tests/extension*.test.js`, `maskSensitive.test.js` |
| Playwright (mock HTML + engine) | `apps/extension/e2e/fill-accuracy.playwright.spec.ts` |
| Extension unit | `apps/extension/tests/security.test.js` |

## Build

```bash
npm run build:extension
# → apps/extension/dist + apps/extension/release/darshandesk-extension-v1.0.0.zip
```

See `apps/extension/SUPPORTED_FIELD_MAPPING.md` and `FIELD_MAPPING_REPORT.md`.