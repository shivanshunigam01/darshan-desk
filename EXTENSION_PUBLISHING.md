# DarshanDesk Extension — Store Publishing

## Artifact

- **ZIP:** `apps/extension/release/darshandesk-extension-v1.0.0.zip`
- **Unpacked:** `apps/extension/dist/` (Chrome → Load unpacked for staging)

Rebuild:

```bash
DD_PRODUCTION_API_ORIGIN=https://api.example.com \
DD_PRODUCTION_DASHBOARD_ORIGIN=https://app.example.com \
npm run build:production -w @darshan-desk/extension
```

## Allowed origins & extension ID

1. **Chrome Web Store** — after first upload, note **Extension ID** (e.g. `abcdefghijklmnopqrstuvwxyzabcd`).
2. Set **OAuth / API allowlist** if you add keyed APIs later (not required for current JWT + pairing-token model).
3. Update production `host_permissions` via env vars above — must match API and dashboard HTTPS origins.
4. **Content scripts** only on:
   - `https://api.example.com/mock-booking/*` (staging fixture), **or**
   - Future approved mapping hosts (not live TTD until store + legal approval).

See `apps/extension/SUPPORTED_PAGES.md`.

## Pairing against production API

1. Deploy API with `CORS_ORIGINS` including `chrome-extension://<EXTENSION_ID>` **only if** you call API from extension pages — current design uses `host_permissions` to API host (fetch from service worker), not dashboard origin.
2. Extension popup: set **API base URL** to `https://api.example.com`.
3. Dashboard: validate preparation → generate pairing token.
4. Extension: **Connect to DarshanDesk** → receives `accessToken` (15 min default).
5. Verify `POST /api/preparations/extension/heartbeat` with headers:
   - `x-pairing-token`
   - `x-extension-instance-id`
   - `x-extension-access-token`

## Chrome Web Store checklist

- [ ] Privacy practices questionnaire (operator data, no payment/OTP automation).
- [ ] Single purpose: form assist for prepared pilgrims.
- [ ] Screenshots + description stating manual submit/declarations.
- [ ] Permissions justification: `storage`, `tabs`, explicit `host_permissions`.

## Microsoft Edge Add-ons

- Upload same ZIP (Chromium MV3 compatible).
- Re-test pairing on Edge stable.

## Post-publish sync

- Document store version ↔ API `APP_VERSION` compatibility in release notes.
- Operators must update extension when breaking API changes ship.

## Outstanding

- **No production pairing E2E test in CI** against a live URL (manual checklist only).
- **Live TTD domain** not in manifest until approved selector profile exists.