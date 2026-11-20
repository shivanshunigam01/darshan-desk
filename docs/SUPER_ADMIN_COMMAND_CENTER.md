# Super Admin Command Center

**Routes:** `/admin/command-center` (tabs: overview, agencies, accounts, analytics)  
**API:** `/api/platform/command-center/*` — `requireAuth` + `requireSuperAdmin`

## Dashboard cards (MongoDB only)

All 13 overview metrics from `getCommandCenterOverview()`:

- Agencies: total, active license, suspended/revoked
- Users: total operators (excl. super_admin), **active** (last login/active or extension heartbeat within `PLATFORM_ACTIVE_USER_MS`, default 30d)
- TTD references: verified + total linked (non-archived)
- Bookings: validated preparations, **verified** confirmed attempts (`outcome=confirmed` + `verifiedAt` is a date), failed, pending confirmation
- Subscriptions: active vs expired/revoked license filters

Official TTD quota “success” counters are **never** used.

## Tables & exports

- **Agencies** — search, subscription filter, pagination, CSV export
- **Account references** — search, agency filter, verification filter, CSV export; masked identifiers only; verified display name only when authorized
- **Booking analytics** — date range, agency filter; aggregation pipelines for performance

## Security

- Platform audit log (`PlatformAuditLog`) on successful super-admin reads
- Admin emails masked in agency rows
- No `loginIdentifier` / credentials in platform API responses

## Tests

`server/tests/platform.commandCenter.test.js` — RBAC, masking, active users, verified confirm counts, audit trail