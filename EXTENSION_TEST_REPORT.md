# Extension test report

**Date:** 2026-11-16

## Automated results

| Suite | Result | Notes |
|-------|--------|-------|
| `@darshan-desk/fill-engine` | **17/17 pass** | 1–4 pilgrims, gender/passport/CAPTCHA, stale profile, duplicate names |
| `server` extension integration | **3/3 pass** | Pair, fill-payload SSOT, pilgrim revision bump, fill-report sanitization |
| `server` maskSensitive | **2/2 pass** | ID masking |
| `@darshan-desk/extension` Jest | **pass** | Host allowlist security |
| Playwright `e2e/fill-accuracy` | **Not run (CI)** | Requires `npx playwright install chromium` (download failed in agent environment) |

## Manual smoke (recommended)

1. `npm run dev` — API `:4000`, client `:5173`.
2. Load `apps/extension/dist` unpacked in Chrome.
3. Wizard → validate prep → copy pairing token → extension **Connect**.
4. **Open dev mock form** → pilgrims step → **Fill form** → verify field results 100%.
5. Edit pilgrim in dashboard → **Sync preparation** → re-fill shows updated name.
6. Toggle CAPTCHA on confirm step → fill reports `captcha_required`.

## Production artifact

`apps/extension/release/darshandesk-extension-v1.0.0.zip` (from `npm run build:extension`).