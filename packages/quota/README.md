# @darshan-desk/quota

Typed **QuotaSummary** and **QuotaDataProvider** implementations for the SRIVANI Quota Information Dashboard.

## Providers

| Provider | Purpose |
|----------|---------|
| `MockQuotaProvider` | Fixture JSON + deterministic scenarios (incl. `ttd_screenshot_bar`, `policy_v2`) |
| `ManualQuotaProvider` | Operator-recorded observations with `observedAtUtc` and `source` |
| `ApprovedOfficialQuotaProvider` | Disabled by default — no undocumented polling |

## Security constraints (enforced by design)

- No concurrent quota fetches per agency (server `quotaService.js`)
- Manual refresh only in UI — no release-time polling
- No cookies, rate-limit bypass, or protected endpoint scraping

## API

- `GET /api/quota/dashboard?provider=&scenario=&bookingCategory=`
- `POST /api/quota/manual`
- `GET /api/quota/scenarios`

## UI

`/srivani/quota` — cards, meta bar, timeline, diagnostics, manual observation form.

## Tests

```bash
npm run test -w @darshan-desk/quota
```

Covers: zero/positive quota, stale, missing fields, invalid release time, unavailable, policy versions, unauthorized (server `quota.api.test.js`).