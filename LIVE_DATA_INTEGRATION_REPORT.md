# LIVE DATA INTEGRATION REPORT — SRIVANI quota / TTD provider

**Date:** 2026-11-16

## Documented authorized data provider

| Mode | Provider class | Upstream path (approved) | Auth |
|------|----------------|----------------------------|------|
| `mock` | `MockProvider` | Fixture JSON scenarios | None |
| `approved` | `ApprovedProvider` | `GET {base}/dms/darshansummarySrivaniCurrentDay` | Server-only `TTD_INTEGRATION_AUTH_TOKEN` |

Configured via `server/.env` (`TTD_INTEGRATION_MODE`, `TTD_INTEGRATION_ENABLED`, `TTD_INTEGRATION_AUTH_TOKEN`). Browser never receives tokens.

## Permission scope

- Approved mode runs **only on the server** inside `QuotaService`.
- Agency operators receive **envelope** via `GET /api/ttd/quota/current` or quota dashboard — not raw cookies or portal session.
- Global cache is **shared across agencies** (upstream is not per-tenant); UI must label `source`, `isStale`, `providerStatus`.

## Freshness

| Signal | Meaning |
|--------|---------|
| `minRefreshMs` / `cacheTtlMs` | Policy from env |
| `meta.stale` | Served from cache when refresh throttled |
| `observedAt` | Last successful parse time |
| `NOT_CONFIGURED` | No provider (approved disabled or mock not constructed) |

**Audit fix:** `QuotaService` now instantiates `MockProvider` when `mode === "mock"` even without explicit scenario (previously threw `NOT_CONFIGURED`).

## Tests executed

| Suite | Result |
|-------|--------|
| `@darshan-desk/quota` | 14/14 PASS |
| `@darshan-desk/ttd-integration` | 14/14 PASS |
| `server/tests/quota.api.test.js` | PASS (in server script) |
| `server/tests/ttd.api.test.js` | PASS (in server script) |

## Live call verification

| Check | Status |
|-------|--------|
| Call live TTD with production token in this audit | **NOT PERFORMED** — no token in workspace; env shows `TTD_INTEGRATION_ENABLED=false` |
| Validate response schema against `parseQuotaSummary` | **PASS** in fixture tests only |
| Compare official `success` field to agency bookings | **N/A** — product explicitly does **not** use global success as agency booking count |

## Third-party limitations

- Network, IP allowlisting, and TTD rate limits are outside DarshanDesk control.
- Quota display does not guarantee ticket issuance (stated in mock UI and API notices).
- Approved integration requires contractual/operational approval from TTD — not evidenced in this repo.