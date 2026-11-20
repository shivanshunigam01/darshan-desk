# MotionSites design research — DarshanDesk

References are **real** MotionSites prompt IDs. Use for layout/motion inspiration on operational UI — not 1:1 marketing hero copy.

| ID | Link | Category | Relevant DarshanDesk screen | Takeaways |
|----|------|----------|---------------------------|-----------|
| `data-signal` | https://motionsites.ai/?prompt=data-signal | Analytics (free) | Agency dashboard, Command Center overview | KPI grid density, muted charts, tabular numbers |
| `quantum-core` | https://motionsites.ai/?prompt=quantum-core | Data Intelligence (free) | Booking analytics | Dark-friendly data cards, clear hierarchy |
| `quantum-lucid` | https://motionsites.ai/?prompt=quantum-lucid | SaaS (free) | App shell / nav | Soft surfaces, accent on primary actions only |
| `autonomous-ops` | https://motionsites.ai/?prompt=autonomous-ops | SaaS (free) | Dashboard feature cards | Three-column metric cards, minimal ornament |
| `axle-journey` | https://motionsites.ai/?prompt=axle-journey | Dashboard (premium) | Operations dashboard | Stat row + map/visual secondary panel pattern |
| `growth-analytics` | https://motionsites.ai/?prompt=growth-analytics | SaaS (premium) | Super Admin analytics tab | Bar trends, filter bar above charts |
| `aurora-onboard` | https://motionsites.ai/?prompt=aurora-onboard | Sign Up (free) | Login / wizard early steps | Step indicator, centered form rhythm |
| `intelligent-systems` | https://motionsites.ai/?prompt=intelligent-systems | SaaS (premium) | Settings, subscription | Sectioned forms, sidebar + content |
| `ai-meeting-notes` | https://motionsites.ai/?prompt=ai-meeting-notes | SaaS (premium) | Booking history table | Table + status chips, transcript-style density |

**Typography:** Inter (already loaded) matches most references.  
**Spacing:** 4px scale — map to `--space-*` tokens.  
**Motion:** 150–250ms UI; references use subtle card hover, not looping backgrounds.

**React Bits:** Not wired in `package.json` yet — phase A uses CSS transitions + `lib/motion.js` until bits are curated per screen.