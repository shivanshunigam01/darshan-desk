# Extension QA report

**Migration:** extension-first (checkpoint 2026-11-20)

## Automated (run locally)

| Suite | Command | Status |
|-------|---------|--------|
| Fill engine | `npm run test -w @darshan-desk/fill-engine` | Pending run |
| Extension unit | `npm run test -w @darshan-desk/extension` | **3/3 passed** (2026-11-20) |
| Playwright mock | `npm run test:e2e -w @darshan-desk/extension` | Pending run |
| API | `npm run test -w server` | Pending run |

## Manual smoke (after build)

- [ ] Extension loads from `dist/`
- [ ] Login screen + logo
- [ ] Sign in against local API
- [ ] Bottom navigation between screens
- [ ] Live clock updates
- [ ] Language switch persists
- [ ] Fill tab legacy autofill on mock/live page

## Phase 11 full matrix

See `EXTENSION_MIGRATION_PLAN.md` — tests 1–34 to be implemented incrementally.