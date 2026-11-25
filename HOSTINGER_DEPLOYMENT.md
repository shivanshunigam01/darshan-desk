# Hostinger / VPS deployment (API for extension)

Extension operators only need a reachable HTTPS API. The React `client/` dashboard is optional.

## Server layout

1. Ubuntu VPS (Hostinger KVM or similar) with Node 20, PM2, Nginx, Certbot.
2. Clone repo; set `server/.env` from `server/.env.production.example` (never commit secrets).
3. Build workspace packages:

```bash
npm run predev
```

4. Start API with PM2:

```bash
cd server
NODE_ENV=production node src/index.js
# or: pm2 start src/index.js --name darshan-api
```

## Required environment (names from repo)

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | Atlas connection |
| `JWT_SECRET` | Operator + extension JWT |
| `CORS_ORIGINS` | Comma-separated allowed web origins |
| `EXTENSION_ACCESS_TTL_SEC` | Extension access token lifetime |
| `TTD_INTEGRATION_*` | Server-side quota adapter (optional) |

Chrome extensions use `chrome-extension://` origins — allowed in `server/src/config/env.js` without listing.

## Nginx

- Terminate TLS; proxy `https://darshan.<your-domain>/` → `127.0.0.1:4000`.
- Do **not** expose MongoDB publicly.
- Serve `/mock-booking` only on staging, not production.

See also `EC2_UBUNTU_NGINX.md` for a full Nginx + Certbot walkthrough (same pattern on Hostinger VPS).

## Extension build for production

```bash
DD_PRODUCTION_API_ORIGIN=https://darshan.<your-domain> npm run build:extension
```

Distribute `apps/extension/release/darshandesk-extension-v1.0.0.zip` to agencies (sideload or store).