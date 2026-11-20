# DarshanDesk — Extension-first migration plan

**Checkpoint branch:** `checkpoint/pre-extension-first` (local Git initialized 2026-11-20)  
**Target product:** Standalone Chrome/Edge extension + minimal Node API + MongoDB

## Executive summary

Migrate daily operator work from the React dashboard (`client/`) into `apps/extension/`, while retaining the Express/Mongo backend for auth, tenancy, licenses, pilgrims, preparations, TTD account references, audit, and fill-engine validation. No destructive DB migrations in this phase.

## Target repository layout

```
apps/extension/          # Primary product UI (popup + content + background)
server/                  # Minimal secure API (retained)
packages/
  quota/                 # Retain — quota logic
  fill-engine/           # Retain — autofill + validation
  reliability/           # Retain — booking attempts
  ttd-integration/       # Retain — live quota adapter
  shared/                # NEW — cross-package types/constants (incremental)
archive/
  dashboard-mern-client/ # Pointer + frozen snapshot policy (client/ archived in place)
client/                  # ARCHIVED — not in default build (see client/ARCHIVED.md)
tests/
  extension/             # Planned consolidation (currently apps/extension/tests + e2e)
  api/                   # server/tests (retained)
  e2e/                   # Playwright mock + optional live docs
```

## Modules to retain (unchanged ownership)

| Area | Location | Notes |
|------|----------|--------|
| Agency/tenant isolation | `server/middleware`, models | No change |
| License enforcement | `server/middleware/agencyLicense.js` | Extension calls `/api/auth/me` |
| Pilgrim CRUD | `server/routes/catalog.js` | Wired to extension UI (Phase 4) |
| TTD account references | `server/routes/ttdAccounts.js`, `catalog.js` | No passwords server-side |
| Preparations | `server/routes/preparations.js` | Deprecate pairing token over time |
| Extension fill API | `server/services/extensionFillService.js` | Keep until JWT-native sync lands |
| Autofill engine | `packages/fill-engine` | Live + mock mappings |
| Security tests | `server/tests/security*.js`, `apps/extension/tests` | Must pass |
| Audit / masking | `server/utils/maskSensitive.js` | ID numbers never logged |

## Modules to migrate (dashboard → extension)

| Dashboard feature | Current | Extension target |
|-------------------|---------|------------------|
| Login | `client/` | `apps/extension/src/pages/LoginPage.tsx` |
| Home / status | Dashboard home | `HomePage.tsx` |
| TTD accounts | Client pages | `TtdAccountsPage.tsx` |
| Pilgrims | Client CRUD | `PilgrimsPage.tsx` |
| Booking preparation | Wizard | `PreparationPage.tsx` |
| Sync & fill | Pairing + popup | `ReadyToFillPage.tsx` + legacy workflow |
| Settings / language | N/A | `SettingsPage.tsx` + `i18n/` |
| Quota live bar | Client components | Phase 10 optional compact widget |

## Modules to archive

| Module | Action |
|--------|--------|
| `client/` (Vite React dashboard) | **Archived in place** — `client/ARCHIVED.md`; removed from root `dev`/`build` scripts |
| `apps/extension/src/content/dashboard-sync.ts` | Remove after pairing deprecated |
| Platform command center | Keep API for super_admin; no extension UI in v1 |
| Mock booking pages served only for tests | Retain on server for Playwright |

## Modules no longer required in active product

- Dashboard-to-extension **pairing token** flow (replace with JWT session + preparation id) — transitional: legacy workflow retained under `features/fill/LegacyFillWorkflow.tsx`
- Concurrent `client` dev server in default `npm run dev`
- Dashboard-specific routes, layouts, wizard duplicates in `client/src`

## Database migration impacts

| Change | Status | Approval |
|--------|--------|----------|
| New collections | None required for Phase 1–7 | — |
| Refresh tokens collection | **Planned** Phase 2 (`RefreshToken` model) | Required before prod |
| Argon2id password hashes | **Planned** — verify bcrypt + rehash on login | Non-destructive |
| Pilgrim ID encryption | Verify existing field encryption at rest | Audit existing `Pilgrim` model |
| Drop dashboard-only indexes | None | N/A |

## Auth roadmap (Phase 2)

| Endpoint | Today | Target |
|----------|-------|--------|
| `POST /api/auth/login` | bcrypt JWT 12h | + Argon2id for new/changed passwords |
| `POST /api/auth/refresh` | **Missing** | Add rotation |
| `POST /api/auth/logout` | **Missing** | Revoke refresh + optional blocklist |
| `GET /api/auth/me` | Exists | Keep |

Extension stores **access token only** in `chrome.storage.session` (not passwords).

## Tests that must remain green

- `npm run test -w @darshan-desk/fill-engine`
- `npm run test -w @darshan-desk/extension`
- `npm run test -w server` (subset: auth, extension, tenant, license, security)
- Playwright: `apps/extension/e2e/fill-mock.playwright.spec.ts`

## Phase completion tracker

| Phase | Status | Evidence |
|-------|--------|----------|
| 1 Repository simplification | **In progress** | This doc, `client/ARCHIVED.md`, root scripts, Git checkpoint |
| 2 Extension authentication | **Started** | `services/authStorage.ts`, `LoginPage`, existing `/api/auth/login` |
| 3 TTD accounts in extension | **Planned** | Placeholder page + existing API |
| 4 Pilgrim CRUD in extension | **Planned** | Placeholder + `/api/catalog/pilgrims` |
| 5 Preparation flow | **Planned** | Policy config package + preparations API |
| 6 Autofill | **Retained** | `fill-content.ts`, `LegacyFillWorkflow` |
| 7 UI/UX (Tailwind, theme, logo) | **Started** | Theme tokens, bottom nav, logo asset |
| 8 Live clock | **Started** | `LiveClock.tsx` |
| 9 i18n EN/HI/TE | **Started** | `src/i18n/` |
| 10 Backend sync | **Partial** | JWT for CRUD; pairing for fill (transition) |
| 11 Testing | **Planned** | `EXTENSION_QA_REPORT.md` template |
| 12 Release docs | **Started** | User guide + deployment stubs |

## Rollback

1. Checkout `checkpoint/pre-extension-first`
2. Restore root `package.json` scripts including `client`
3. Point popup `main.tsx` back to legacy-only `App.tsx` if needed

## Next implementation steps (ordered)

1. Remove pairing dependency from service worker (JWT + `GET /api/extension/active-preparation`)
2. Implement pilgrim/TTD account pages against catalog API
3. Preparation wizard with versioned donation policy (`packages/shared/srivaniPolicy.ts`)
4. Add refresh/logout + Argon2id with bcrypt fallback
5. Delete `client` from workspace after 30-day archive window (requires explicit approval)
6. Generate PNG icons 16/48/128 from `src/assets/logo.jpg`
7. Expand Playwright matrix per Phase 11