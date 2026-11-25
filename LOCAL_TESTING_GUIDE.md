# Local testing guide — extension-first

## Prerequisites

- Node 20+
- MongoDB (local or Atlas) — copy `server/.env.example` → `server/.env`

## Start API

```powershell
cd darshan-desk
npm run predev
npm run dev:api
```

API: `http://localhost:4000`  
Mock TTD form: `http://localhost:4000/mock-booking/?pilgrims=4`

## Build & load extension

```powershell
npm run build:extension
```

Load unpacked: `darshan-desk\apps\extension\dist`

In extension **Settings**, set API URL to `http://localhost:4000` if not using production default.

## Happy path

1. Register or sign in in the extension popup.
2. **TTD Accounts** — add labeled login reference (password optional, device-only).
3. **Pilgrims** — add 1–4 profiles.
4. **Preparation** — pick account, donation (e.g. 10000/20000/30000/40000), pilgrims → **Save, validate & connect fill**.
5. Open mock page (or live SRIVANI pilgrim page) in a normal tab.
6. **Fill** — Reconnect if needed → **Sync & Fill**.
7. **Monitor** — open same tab; confirm quota bar + Continue readiness updates.
8. On mock quota step, wait ~8s — Continue enables; Monitor shows **Ready to Continue** (operator still clicks manually).

## Playwright (optional)

```powershell
npm run test:e2e -w @darshan-desk/extension
```

Requires webServer from `playwright.config.ts` (API on :4000).

## Backend smoke

```powershell
npm run test -w server
```

Expect known failures in register/policy snapshot tests until policy seed is fixed.