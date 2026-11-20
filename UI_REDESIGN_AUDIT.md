# DarshanDesk UI/UX Redesign Audit

> **Superseded in part by** [`DESIGN_AUDIT.md`](DESIGN_AUDIT.md) and [`DESIGN_RESEARCH.md`](DESIGN_RESEARCH.md) (2026-11-16 enterprise design pass).

**Updated:** 2026-11-16  
**Stack:** React (Vite) + Tailwind + shadcn-style UI primitives + Express + MongoDB + MV3 extension

## 1. Existing pages & routes (current)

| Route | Page | Data source | Status |
|-------|------|-------------|--------|
| `/login` | `LoginPage.jsx` | `/api/auth/login` | Working |
| `/dashboard` | `DashboardPage.jsx` | preparations, catalog, quota, reliability, policy, extension | Working (live aggregation) |
| `/booking/prepare`, `/:id` | `BookingPreparePage.jsx` | preparations, policy, catalog, extension | Working 10-step wizard |
| `/pilgrims` | `PilgrimManagementPage.jsx` | `/api/catalog/pilgrims` CRUD | Working |
| `/pilgrim-groups` | `PlaceholderPage` | — | **No API** (marked Soon) |
| `/ttd-accounts` | `TtdAccountsPage.jsx` | `/api/ttd-accounts` | **Multi-account manager** — consent, verify, assign, booking stats from `BookingAttempt`, audit log, reference-only credentials |
| `/srivani/quota` | `QuotaDashboardPage.tsx` | quota + ttd integration | Working (provider labeled) |
| `/srivani/history` | `BookingHistoryPage.tsx` | reliability attempts | Working |
| `/srivani/qa` | `QaReliabilityPage.tsx` | reliability lab | Working (not in agency sidebar) |
| `/extension` | `ExtensionConnectionPage.jsx` | docs + prep pairing | Working |
| `/operators` | `PlaceholderPage` | — | **No roster API** |
| `/subscription` | `SubscriptionPage.jsx` | admin license | Agency admin |
| `/settings` | `SettingsPage.jsx` | `/auth/me` | Working |
| `/preparations` | `PreparationsListPage.jsx` | preparations list | Legacy (reachable, not in nav) |
| `/srivani/status/:id` | `BookingStatusPage.jsx` | record outcome | Wizard step 10 |
| `/admin/overview` | `AdminOverviewPage.jsx` | — | Super admin |
| `/admin/command-center` | `AdminCommandCenterPage.jsx` | `/api/platform/command-center/*` | Super admin |
| `/admin/agencies` | Command center tab `agencies` | platform APIs | Super admin |
| `/admin/account-references` | Command center tab `accounts` | platform APIs | Super admin |
| `/admin/analytics` | `AdminAnalyticsPage.jsx` | agency reliability report | Admin |
| `/admin/license` | `AdminLicensePage.jsx` | `/api/admin/license` | Agency admin + super |
| `/admin/users`, `/admin/plans`, `/admin/logs` | `PlaceholderPage` | — | Honest gaps |

## 2. Functional API bindings

All client methods in `client/src/api.js` map to server routes under `server/src/routes/`. Wizard and dashboard use **real MongoDB tenant data**; quota defaults to **mock provider** unless server configured otherwise — UI labels `meta.providerKind` and stale flags.

## 3. Navigation (fixed)

- **Agency sidebar:** 11 items per spec (`config/navigation.js`).
- **Super admin sidebar:** platform items; `RequireSuperAdmin` on cross-tenant routes.
- **Agency admin** sees Subscription + License in platform subsection; operators do not.
- **Legacy:** `/srivani/prepare` → `/booking/prepare`.

## 4. Broken / duplicate (resolved or documented)

| Issue | Resolution |
|-------|------------|
| No landing dashboard | `/dashboard` default after login |
| Monolithic prepare page | `BookingPreparePage` 10 steps + context panel |
| QA in operator nav | Removed from sidebar; linked from admin overview |
| Fake KPIs | Dashboard uses API counts; operator total shows `—` without API |
| Mock quota as live | Dashboard + quota pages label provider/stale |
| Duplicate prepare flows | Single wizard; list at `/preparations` optional |

## 5. Booking wizard (10 steps)

1. TTD account · 2. Category · 3. Donation · 4. Pilgrims · 5. Validate · 6. Review · 7. Extension · 8. Official/mock site · 9. Operator verification · 10. Outcome (`/srivani/status/:id`)

Features: stepper, back/next, save draft, field validation gates, `WizardContextPanel` on desktop.

## 6. Design system

- Colors: navy primary, white surfaces, canvas background (`tailwind.config.js`).
- Semantics: green success, amber warning, red danger (`components/ui/alert.jsx`, badges).
- Icons: `lucide-react`. Primitives: `components/ui/*`.

## 7. TTD Account Manager (multi-account)

- **Model:** `TtdAccountReference` + `TtdAccountAuditLog` (no cookies/OTP/passwords in MongoDB).
- **API:** `server/src/routes/ttdAccounts.js`, stats via `BookingPreparation` + `BookingAttempt` aggregations.
- **Auth:** agency isolation; operators see assigned/owned refs; admins assign operators and edit owners.
- **Tests:** `server/tests/ttdAccounts.authorization.test.js` (71/71 server suite green).

## 8. Still not implemented (honest)

- Pilgrim groups model/API  
- Agency operator roster UI  
- Subscription plans billing API  
- System logs feed UI  
- Cross-agency “agency users” admin API  

## 9. Verification commands

```bash
npm run test -w client
npm run build -w client
npm test
```

Seed logins (see `server/src/seed.js`): agency operator, agency admin, super admin.

## 10. Screenshots

Capture locally after `npm run dev`: `/login`, `/dashboard`, `/booking/prepare` steps 1–6, `/admin/command-center` (super admin).