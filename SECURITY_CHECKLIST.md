# DarshanDesk — Security Checklist

Use before production cutover. Items marked **(automated)** have in-repo tests; **(manual)** require your environment.

## Secrets & credentials

- [ ] **(manual)** No `.env` files committed; rotate any demo passwords exposed in dev.
- [ ] **(manual)** `JWT_SECRET` ≥ 32 bytes random; unique per environment.
- [ ] **(manual)** Atlas credentials not in client or extension bundles.
- [ ] **(manual)** `TTD_INTEGRATION_AUTH_TOKEN` server-only; never in browser.
- [ ] **(automated)** Extension manifest: no `cookies` / `webRequest` permissions (`apps/extension/tests/security.test.js`).
- [ ] **(automated)** Extension API client: no OTP/password/captcha routes (`security.test.js`).

## CORS & HTTPS

- [ ] **(implemented)** `CORS_ORIGINS` exact allowlist — `server/src/config/env.js`.
- [ ] **(automated)** Unknown browser origin blocked — `tests/security.api.test.js`.
- [ ] **(manual)** TLS on `app.example.com` and `api.example.com` (Certbot or Vercel).
- [ ] **(implemented)** `trust proxy` for Nginx — `TRUST_PROXY_HOPS=1`.
- [ ] **(manual)** HSTS enabled at CDN/Nginx.

## Session & extension pairing

- [ ] **(implemented)** JWT for dashboard; short-lived extension access tokens (`extensionAuthService.js`).
- [ ] **(implemented)** Extension connect enforces agency license when `LICENSE_ENFORCE=true` (`extensionFillService.js`).
- [ ] **(manual)** Extension pairing tested against production API URL with HTTPS.
- [ ] **(manual)** Store-published extension ID documented in `EXTENSION_PUBLISHING.md`.
- [ ] **(implemented)** Pairing tokens expire; access tokens hashed; revocation on disconnect.

## Tenant isolation

- [ ] **(automated)** Route files use `req.agencyId` + `requireAuth` (`tenantIsolation.logic.test.js`).
- [ ] **(automated)** Cross-tenant Mongo tests implemented (`tests/tenantIsolation.integration.test.js`) — **(manual)** run with `MONGODB_URI_STAGING` or local Mongo before prod.
- [ ] **(implemented)** Preparation/attempt queries scoped by `agencyId` in services.

## License activation / revocation

- [ ] **(implemented)** Agency fields + admin APIs: `POST /api/admin/license/activate`, `POST /api/admin/license/revoke`.
- [ ] **(implemented)** `LICENSE_ENFORCE=true` enforced on all JWT operator routes via `requireAuth` → `requireActiveLicense` (`middleware/auth.js`).
- [ ] **(automated)** Revoked / suspended / expired → 403 codes — `tests/license.middleware.unit.test.js`.
- [ ] **(manual)** Live supertest license matrix — `tests/license.enforcement.test.js` with Mongo available.
- [ ] **(manual)** Test activate → operator works → revoke → operators blocked when enforce enabled (staging).

## API hardening (Express)

- [ ] **(implemented)** `helmet`, global `express-rate-limit`, login rate limit — `server/src/middleware/security.js`.
- [ ] **(implemented)** JSON body limit, request timeouts, structured audit log (no secrets in URL via redaction).
- [ ] **(implemented)** Zod validation on login — `server/src/validation/schemas.js`.
- [ ] **(implemented)** Production error responses hide stack/details unless `err.expose`.
- [ ] **(manual)** Tune `RATE_LIMIT_*` and `LOGIN_RATE_LIMIT_*` per environment (`server/.env.production.example`).
- [ ] **(note)** Rate limits apply to DarshanDesk API only; **no** TTD upstream limit evasion.

## Booking safety

- [ ] **(automated)** Outcome state machine blocks CONFIRMED without evidence (`packages/reliability` — 42 tests).
- [ ] **(implemented)** Duplicate submission guard on reliability transitions.
- [ ] **(manual)** Confirm no product UI auto-clicks official submit on live TTD (only mock form mapped).

## Privacy

- [ ] **(automated)** Diagnostic export redacts mobile/PAN patterns (`reliability.test.js`).
- [ ] **(implemented)** Sentry `beforeSend` scrubs passwords, tokens, Aadhaar/PAN keys (`errorMonitor.js`).
- [ ] **(manual)** Privacy policy for extension store listing.

## Monitoring

- [ ] **(implemented)** `@sentry/node` dependency; init when `SENTRY_DSN` set (`errorMonitor.js`).
- [ ] **(implemented)** Database connectivity failure logged to monitoring hook (`index.js`).
- [ ] **(manual)** Verify events in Sentry project; confirm no PII in sample events.
- [ ] **(manual)** PM2 + Nginx access/error logs; Atlas monitoring alerts.

## TTD / quota

- [ ] **(manual)** Live TTD API disabled unless `TTD_INTEGRATION_ENABLED` with written approval.
- [ ] **(automated)** Quota responses include `meta.observedAt` / stale flags (`ttd-integration` tests).

## Regression (2026-11-15)

| Check | Result |
|-------|--------|
| `npm test` | **138/138 PASS** |
| `npm run build` | PASS |
| `npm run build:extension` | PASS |
| Production deploy | **Not run** (by design) |