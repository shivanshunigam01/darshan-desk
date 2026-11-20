# DarshanDesk motion guidelines

## Principles

- Motion explains state change (navigation, loading, step advance).
- Respect `prefers-reduced-motion: reduce` — disable entrance animations.
- Use `transform` and `opacity` only on animated elements.
- Duration: **150–250ms** UI; **200–300ms** route/content swap.
- No particles, parallax, or animated backgrounds behind data tables.

## Utilities

- `client/src/lib/motion.js` — `motionClass()`, `usePrefersReducedMotion()`
- CSS: `.dd-enter`, `.dd-fade-in`, `.dd-sidebar-rail` in `tokens.css`

## Per-area

| Area | Behavior |
|------|----------|
| App shell | Sidebar collapse 200ms; active nav left rail |
| Dashboard | Staggered KPI fade-in (max 6 cards, 40ms delay each) |
| Wizard | Step panel `dd-enter` on step index change |
| Tables | Row hover background only (no row slide-in) |
| Extension popup | Separate bundle; state color transition 200ms |

## Anti-patterns

- Scaling inputs on focus
- Infinite pulse on success/error badges
- Count-up on static zeros or placeholders (`—`)