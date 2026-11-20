# DarshanDesk landing (static)

Single-page site: **`index.html`** (features, install steps, download CTA).

## Deploy on Vercel

1. [vercel.com](https://vercel.com) → **Add New Project** → Import `shivanshunigam01/darshan-desk`.
2. **Root Directory** → **Edit** → set to `apps/landing`.
3. **Framework Preset** → **Other** (no build).
4. **Build Command** → leave empty.
5. **Output Directory** → `.` (dot).
6. Deploy → you get e.g. `https://darshandesk.vercel.app`.
7. Optional: **Settings → Domains** → add `www.totallylearns.com` or a marketing subdomain.

## CLI (from repo root)

```bash
npm i -g vercel
cd apps/landing
vercel --prod
```

## Extension ZIP

The primary download button uses Google Drive (see `index.html`). Rebuild the extension on your PC when you release a new version; upload a new ZIP to Drive and update the link + version text in `index.html`.

**API URL** on the page should match production (e.g. `https://darshan.totallylearns.com`).