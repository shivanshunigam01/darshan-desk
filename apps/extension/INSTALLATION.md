# DarshanDesk Chrome Extension — Installation

## Prerequisites

1. DarshanDesk API running (`http://localhost:4000`) with MongoDB.
2. Operator logged into the web dashboard.
3. A **validated** booking preparation (`validationStatus: passed`).
4. Pairing token generated from the preparation screen (**Extension connection** panel).

## Development (unpacked)

```bash
cd C:\Users\Admin\Desktop\TTD
npm install
npm run build -w @darshan-desk/fill-engine
npm run build -w @darshan-desk/extension
```

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `C:\Users\Admin\Desktop\TTD\apps\extension\dist`

## Production ZIP

```bash
npm run build:production -w @darshan-desk/extension
```

Install from `apps/extension/release/darshandesk-extension-v1.0.0.zip` via Chrome Web Store packaging workflow or enterprise policy (sideload for dev).

## Operator workflow (steps 1–10)

1. Log into DarshanDesk (MERN dashboard) and save a preparation (agency account, category, pilgrims).
2. Validate preparation → **Generate pairing token** on the preparation page.
3. In the extension: **Connect to DarshanDesk** (paste token) → receives a **short-lived access token** (server-side, not stored in MongoDB).
4. Popup shows agency, TTD account label, active preparation, and pilgrim count.
5. **Open supported mock form** → go to the **pilgrims** step (see `SUPPORTED_PAGES.md`).
6. **Validate & fill visible fields** — audits preparation, fills, verifies, reports field-level results.
7. Check **I reviewed every filled field** — operator submits manually on the official portal (no auto-submit).
8. **Disconnect** revokes extension access server-side.
9. Popup shows field-level results (missing, incorrect, needs confirmation).
10. Operator reviews and submits **only on the official website** (declarations, CAPTCHA, payment manual).

## Security notes

- No password, OTP, CAPTCHA, session token, or payment automation.
- No live TTD selectors in this build — only `mock-srivani-v1` mapping for the local mock site.
- Overwrite of non-empty differing fields requires explicit operator opt-in.