# DarshanDesk Recovery Audit (2025-11-25)

## Repository state

| Item | Finding |
|------|---------|
| Git root | `darshan-desk/` (parent `TTD/` is **not** a git repo) |
| Branch | `recovery/extension-completion-2025-11-25` (from `main`) |
| Remote | `origin/main` @ `0794256` — clean clone, **no local reflog beyond clone** |
| Stashes | None |
| Local branches | Only `main` + recovery branch |
| Untracked work | None before recovery; **no unpushed advanced extension** found outside Git |

## Version map

| Artifact | Version | Role |
|----------|---------|------|
| `apps/extension` | 1.0.0 | **Primary** React/TS MV3 extension |
| `archive/legacy-extension-v1` | 1.0.0 | Archived minimal extension (dashboard pairing era) |
| `server` | 1.0.0 | Express + MongoDB API |
| Workspace packages | fill-engine, quota, reliability, ttd-integration | Shared logic |

## Recovered / already present

- Extension login, register, home summary (`/api/extension/home-summary`)
- TTD account CRUD (masked refs, device-only password assist)
- Pilgrim CRUD with backend sync
- Donation preparation + validation in extension
- Fill engine (mock + live SRIVANI pilgrim fields)
- Backend pairing + extension JWT access (30m pairing / 15m access TTL)
- Playwright E2E against `/mock-booking`
- Server test suite (extension, license, tenant isolation)

## Gaps addressed in this recovery branch

- **Booking monitor** UI + content script (`observeContinueReadiness`, quota bar reader)
- **Extension-only connect** — no pairing-token paste UI; auto-reconnect via operator JWT
- **Payment assist** — Continue auto-click off by default; gateway highlight only when opted in
- **Mock quota fixture** — official-style quota bar + timed Continue enablement for QA
- **Legacy extension** archived under `archive/legacy-extension-v1/`

## Still backend-paired (intentional)

Pairing tokens remain the **server-side** link between `ExtensionConnection` and `BookingPreparation`. The extension obtains them via authenticated `POST /api/preparations/:id/extension/pair` — not via dashboard copy/paste.

## Files to preserve

- `server/.env` (if present locally) — **never commit**
- `server/src/**`, models, middleware, integration adapters
- `packages/fill-engine/**`
- `apps/mock-booking-site/**`
- `apps/landing/downloads/darshandesk-extension-v1.0.0.zip` (historical release)

## Files changed in recovery

- `packages/fill-engine/src/pageMonitor.ts`
- `apps/extension/src/content/page-monitor-content.ts`
- `apps/extension/src/pages/BookingMonitorPage.tsx`
- `apps/extension/src/lib/extensionConnect.ts`
- `apps/extension/src/features/fill/LegacyFillWorkflow.tsx`
- `apps/mock-booking-site/mock-form.js`
- `archive/legacy-extension-v1/*` (moved from `/extension`)

## Missing / future (not in scope of unpushed recovery)

- No second copy of advanced code in reflog/stash (clone-only history)
- Official TTD DOM selectors may drift — monitor uses label-based parsing + mock `data-dd-quota` attributes
- Dashboard (`client/`) remains in repo but not required for daily operator flow