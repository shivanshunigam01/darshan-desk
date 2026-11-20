# TTD integration configuration

Configure in `server/.env` (server-side only — never expose to the browser).

| Variable | Description |
|----------|-------------|
| `TTD_API_BASE_URL` | Default `https://tirupatibalaji.ap.gov.in` |
| `TTD_INTEGRATION_MODE` | `mock` (default) or `approved` |
| `TTD_INTEGRATION_ENABLED` | `true` only with written permission + approved scope |
| `TTD_INTEGRATION_AUTH_TOKEN` | Server-to-server token if provided by TTD (optional) |
| `TTD_INTEGRATION_MIN_REFRESH_MS` | Minimum interval between quota calls per agency (default `60000`) |
| `TTD_MOCK_SCENARIO` | Mock scenario override for tests/dev |

**Prohibited:** browser cookie replay, scraping another session's `getUserContext`, aggressive release-time polling, rate-limit evasion.

**Quota disclaimer:** A displayed `quotaCount` does not guarantee successful ticket issuance.