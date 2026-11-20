# Agency dashboard & SRIVANI quota — UI modernization

## Before

Prior layout (see conversation audit): flat KPI grids, minimal identity context, quota summarized in a single card without official outcome visualization, no animated KPI updates, and basic pulse skeletons on the quota monitor only.

| View | Reference |
|------|-----------|
| Before — dashboard | Described above; no git snapshot in this workspace |
| Before — quota | Single header block + `animate-pulse` tiles, no outcome chart |

## After

- **Agency command center** (`DashboardPage.jsx`): sticky AppShell identity, `AgencyContextBar` (operator + TTD account context), official snapshot KPIs with stale labeling, `QuotaOutcomeChart`, linked accounts + preparation summary, recent records, extension status, primary **Prepare booking** CTA.
- **SRIVANI quota console** (`QuotaDashboardPage.tsx`): shared command bar, full `SrivaniQuotaMonitor` with staggered cards, skeleton shimmer, animated numerics, outcome chart.

Screenshots (capture after `npm run dev` while logged in):

| View | File |
|------|------|
| After — dashboard | [`screenshots/agency-dashboard-after.png`](screenshots/agency-dashboard-after.png) (captured via Playwright against dev API) |
| After — quota | [`screenshots/srivani-quota-after.png`](screenshots/srivani-quota-after.png) |

To regenerate:

```bash
npm run dev
# Log in, open / and /srivani/quota, save full-page screenshots to client/docs/ui-modernization/screenshots/
```

`before/` placeholders can be filled from a local git checkout of the pre-redesign branch if you need pixel-perfect comparison.