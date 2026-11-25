# DarshanDesk Extension QA Report (2025-11-25)

Branch: `recovery/extension-completion-2025-11-25`

## Automated runs (this machine)

| Suite | Result | Notes |
|-------|--------|-------|
| `@darshan-desk/fill-engine` | **PASS** (20/20) | Includes new `pageMonitor.test.js` |
| `@darshan-desk/extension` unit | **PASS** (3/3) | `security.test.js` — manifest hosts, no extra permissions |
| `npm run build:extension` | **PASS** | ZIP at `apps/extension/release/darshandesk-extension-v1.0.0.zip` |
| `server` (curated list in package.json) | **79/81 PASS** | 2 failures (pre-existing register/policy seed — see below) |
| `server` full `tests/` | **91/95 PASS** | 4 failures tied to `TTDPolicySnapshot` validation in register/CRUD paths |
| Playwright E2E | **Not run** | Requires local API + browser; use `LOCAL_TESTING_GUIDE.md` |

### Pre-existing server failures (not introduced by recovery branch)

- `TTDPolicySnapshot validation failed: capturedAt/source required` during register onboarding tests.

## Build verification

- **Extension dist:** `apps/extension/dist/`
- **manifest:** `apps/extension/dist/manifest.json`
- **ZIP:** `apps/extension/release/darshandesk-extension-v1.0.0.zip`
- Popup bundle: **no** `pairingPlaceholder` / “paste token” strings in `main-*.js` (pairing remains in service worker API headers only).

## Feature checklist (manual still required)

| # | Scenario | Auto | Manual |
|---|----------|------|--------|
| 1 | Extension login | partial | Required |
| 2 | Invalid login | — | Required |
| 3 | License expiry | API tested | Extension UI |
| 4–6 | Account / pilgrim / preparation CRUD | API | Extension UI |
| 7–10 | 1–4 pilgrim fill | fill-engine | Mock + live tab |
| 11 | Sync & Fill | SW logic | Required |
| 12–14 | Validation / CAPTCHA / quota | mock fixture | Monitor tab |
| 15–17 | Continue disabled/enabled, loading | pageMonitor unit | Mock quota countdown |
| 18–19 | Payment summary / gateway | parser unit | Payment page |
| 20–25 | Edge cases | partial | Required |

## Security notes

- TTD passwords: device storage only (`portalCredentials`).
- No auto Continue / Pay Now unless operator enables gateway assist (still manual Pay Now).
- CAPTCHA never automated.