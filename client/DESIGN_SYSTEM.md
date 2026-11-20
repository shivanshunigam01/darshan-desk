# DarshanDesk design system (Phase A)

## Tokens

- Source: `client/src/styles/tokens.css`
- Tailwind bridge: `tailwind.config.js` (`navy`, `accent`, `canvas`, semantic colors)

## Layout components

| Component | Path |
|-----------|------|
| `PageHeader` | `components/layout/PageHeader.jsx` |
| `KPIStatCard` | `components/layout/KPIStatCard.jsx` |
| `EmptyState` | `components/layout/EmptyState.jsx` |
| `ErrorState` | `components/layout/ErrorState.jsx` |
| `StatusIndicator` | `components/layout/StatusIndicator.jsx` |
| `ExtensionStatus` | `components/layout/ExtensionStatus.jsx` |
| `Skeleton` / `DashboardSkeleton` | `components/ui/skeleton.jsx` |

## Theme

- `lib/theme.js` — light/dark on `document.documentElement`
- Toggle in **Settings**

## Motion

See root `MOTION_GUIDELINES.md`.