# DarshanDesk — DESIGN AUDIT

**Date:** 2026-11-16  
**Scope:** `client/` React + Vite app (operational SaaS, not marketing site)

## 1. Existing screens

| Route | Component | API | Maturity |
|-------|-----------|-----|----------|
| `/login` | `LoginPage.jsx` | `/api/auth/login` | Good split hero; tokens pre-redesign |
| `/dashboard` | `DashboardPage.jsx` | preparations, catalog, qa, quota, policy, extension | Live data; plain stat tiles |
| `/booking/prepare` | `BookingPreparePage.jsx` | full prep workflow | 10-step wizard, functional |
| `/pilgrims` | `PilgrimManagementPage.jsx` | catalog CRUD | Table + forms |
| `/pilgrim-groups` | `PlaceholderPage` | — | Honest gap |
| `/ttd-accounts` | `TtdAccountsPage.jsx` | ttd-accounts | Rich manager |
| `/srivani/quota` | `QuotaDashboardPage.tsx` | TTD quota API | Real provider labeling |
| `/srivani/history` | `BookingHistoryPage.tsx` | reliability | Working |
| `/extension` | `ExtensionConnectionPage.jsx` | docs | Static guide |
| `/operators` | `PlaceholderPage` | — | No roster API |
| `/subscription` | `SubscriptionPage.jsx` | license | Agency admin |
| `/settings` | `SettingsPage.jsx` | `/auth/me` | Basic |
| `/admin/command-center` | `AdminCommandCenterPage.jsx` | platform APIs | Super admin |
| `/admin/*` | mixed | platform | Command center strongest |

**Extension:** `apps/extension` popup (separate Vite bundle) — functional, compact UI.

## 2. Usability problems

- Inconsistent color naming (`navy` vs spec primary `#172B4D`).
- Dashboard loading is text-only; no skeleton → layout shift.
- No shared page header / empty / error patterns across pages.
- Sidebar mobile sheet lacks focus trap; acceptable but improvable.
- Wizard step content jumps without transition feedback.
- Dark mode not available despite enterprise expectation.
- `styles.css` legacy file coexists with Tailwind (`index.css` only imported in main).
- Operator count on dashboard correctly shows `—` but visually looks “broken” without explanation card.

## 3. Design inconsistencies

| Area | Issue |
|------|--------|
| Typography | Serif on login hero only; app shell is all Inter |
| Radius | Mix of `rounded-md` and `rounded-lg` on cards |
| Shadows | `shadow-card` on some stats, Cards use border only |
| Semantic colors | `danger` vs spec `Error #D64545` |
| shadcn | `components.json` present; partial hand-rolled ui/* |
| Accent | Amber CTA on login vs navy buttons in app |

## 4. Incomplete states

- Placeholder routes: pilgrim groups, operators, plans, logs.
- Dashboard: active operators (no agency roster API).
- Some pages lack empty-state illustrations/copy beyond plain text.

## 5. Components to reuse

- `AppShell`, `navigation.js`, `ui/button`, `card`, `badge`, `alert`, `input`, `stepper`
- `SrivaniQuotaMonitor`, `WizardContextPanel`, `ExtensionPanel`
- `RequireSuperAdmin`, `AuthContext`

## 6. Screens requiring redesign (phased)

| Phase A (this delivery) | AppShell, Dashboard, Booking wizard, tokens |
| Phase B | Login polish, Quota monitor chrome, TTD accounts table |
| Phase C | Super Admin command center visual pass, Pilgrim management |
| Phase D | Extension connection page, Subscription, Settings theme |

## 7. Performance concerns

- No route-level code splitting (single bundle ~300KB gzip).
- Dashboard fans out 6+ API calls on mount (acceptable; could stagger).
- No `React.memo` on heavy tables (low priority until profiling).
- Quota + dashboard duplicate fetches possible — document, do not merge APIs.

## 8. Animation opportunities

- Sidebar nav active indicator slide (transform, 200ms).
- KPI card entrance stagger on dashboard (reduced-motion: none).
- Wizard step panel fade/slide (opacity + translateY 8px).
- Skeleton pulse for loading regions (CSS only).
- **Avoid:** particle backgrounds, continuous chart motion, input scale on focus.

## 9. MotionSites research summary

See `DESIGN_RESEARCH.md` for nine shortlisted references (dashboard/analytics/SaaS patterns).  
Adopt **structure and density**, not marketing hero imagery, on operational screens.

## 10. Before / after (phase A)

| Item | Before | After |
|------|--------|-------|
| Tokens | Hard-coded Tailwind palette | CSS variables + semantic Tailwind |
| App shell | Static sidebar | Collapsible width, active rail, theme-aware |
| Dashboard | Text loading | Skeleton grid + KPIStatCard + quota/extension panels |
| Wizard | Instant step swap | Animated step region + PageHeader |
| Routes | Static imports | Lazy-loaded page components |