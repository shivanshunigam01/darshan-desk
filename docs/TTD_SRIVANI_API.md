# TTD SRIVANI quota APIs (DarshanDesk)

## Current day (implemented)

| Field | Value |
|-------|--------|
| Method | `GET` |
| URL | `https://tirupatibalaji.ap.gov.in/dms/darshansummarySrivaniCurrentDay` |
| Auth | Required — returns **401** without a valid portal session token |
| DarshanDesk | Browser calls `GET /api/ttd/quota/current?refresh=1`; server uses `ApprovedProvider` |

### Example response shape

Same fields as the official portal summary bar: `quotaCount`, `quotaReleaseTime`, `success`, `pending`, `failed`, `slottime`, donation amounts, current/advance pilgrim limits, etc.

## Advance / “next day” quota

DarshanDesk does **not** ship a second documented DMS path. Probed paths such as `/dms/darshansummarySrivaniAdvanceDay` return **404**.

The **current-day** payload already includes **advance** fields (`advanceminAmount`, `advancemaxAmount`, `advanceminpersons`, `advancemaxpersons`) — these are policy/limit hints, not a separate advance-date inventory.

Advance booking inventory is selected **per date** inside the authenticated SRIVANI donation flow (`#/srivaniedonations`), not via this public summary endpoint in our integration package.

The handoff ZIP (Booking Control Share v2.2.0) is a **Tauri + React desktop** app; DarshanDesk is **React (Vite) + Node API + Chrome extension** — use this repo for agency operations; the handoff source is reference only.

## Enable live data on your machine

In `server/.env`:

```env
TTD_API_BASE_URL=https://tirupatibalaji.ap.gov.in
TTD_INTEGRATION_MODE=approved
TTD_INTEGRATION_ENABLED=true
TTD_INTEGRATION_AUTH_TOKEN=<your ttd-auth-token from logged-in portal>
```

Restart the API. Dashboard **OfficialQuotaLiveBar** and command-center KPIs will show the live snapshot (or errors if the token expired).

Never put the token in the React client or commit it to git.