# DarshanDesk — Production Deployment Guide

**Status:** Deployment assets and server hardening are in-repo. **Full production sign-off requires your Atlas/EC2/Vercel/Store environments** (see [QA_REPORT.md](./QA_REPORT.md) outstanding items).

## Architecture

| Component | Target | Artifact |
|-----------|--------|----------|
| React dashboard | Vercel **or** Nginx static | `client/dist/` |
| Express API | Ubuntu EC2 + PM2 + Nginx | `server/src/index.js` |
| Database | MongoDB Atlas | `MONGODB_URI` |
| Extension | Chrome Web Store / Edge Add-ons | `apps/extension/release/darshandesk-extension-v1.0.0.zip` |
| TLS | Certbot on EC2 **or** Vercel/managed | `deploy/nginx/*.conf` |

## Required commands (repo root)

### Local installation

```bash
cd C:\Users\Admin\Desktop\TTD   # or your clone path
npm install
cp server/.env.example server/.env
# Edit server/.env — never commit secrets
```

### Frontend development

```bash
npm run dev
# Client http://localhost:5173 — API proxy to :4000
```

### Backend development

```bash
npm run dev -w server
# Or: npm run dev (client + server)
```

### Extension development build

```bash
npm run build -w @darshan-desk/fill-engine
npm run build -w @darshan-desk/extension
# Load unpacked: apps/extension/dist
```

### Production builds

```bash
npm run build              # packages + client dist
npm run build:extension    # fill-engine + extension ZIP
```

### Test suite

```bash
npm test
# Optional Mongo integration: npm run test:integration -w server
```

### Database migration / indexes

```bash
# From repo root, server/.env must point at target cluster
npm run migrate:indexes
```

### Production deployment (API on EC2)

```bash
git pull
npm ci
npm run build
cp server/.env.production.example server/.env   # then edit on host
npm run migrate:indexes
pm2 start deploy/ecosystem.config.cjs --env production
pm2 save
sudo ln -sf /path/to/repo/deploy/nginx/darshandesk-api.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# certbot --nginx -d api.example.com
```

### Health check

```bash
npm run health-check -- https://api.example.com
# Or: curl https://api.example.com/health/ready
```

## Environment variables

| File | Purpose |
|------|---------|
| `server/.env.production.example` | API + Atlas + CORS + license |
| `client/.env.production.example` | `VITE_API_BASE_URL` |
| `server/.env.example` | Local dev |

**Production essentials:**

- `NODE_ENV=production`
- `SEED_ON_START=false`
- `JWT_SECRET` — strong random (`openssl rand -hex 32`)
- `CORS_ORIGINS=https://app.example.com` (exact origins, comma-separated)
- `MONGODB_URI` — Atlas app user, IP allowlist EC2 only
- `LICENSE_ENFORCE=true` when billing gate is required (see SECURITY_CHECKLIST)
- `ALLOW_MOCK_SIGNALS=false`

**Extension production build:**

```bash
DD_PRODUCTION_API_ORIGIN=https://api.example.com \
DD_PRODUCTION_DASHBOARD_ORIGIN=https://app.example.com \
npm run build:production -w @darshan-desk/extension
```

## Endpoints

| Path | Use |
|------|-----|
| `GET /health` | Liveness + uptime |
| `GET /health/live` | Minimal alive |
| `GET /health/ready` | MongoDB connected (503 if not) |

## Rollback

1. **API:** `pm2 list` → `pm2 restart darshandesk-api` with previous release tag, or `git checkout <tag> && npm ci && pm2 reload`.
2. **Client:** Vercel → promote previous deployment; Nginx → restore prior `client/dist` snapshot.
3. **Extension:** Chrome/Edge developer dashboard → revert to previous package version (users auto-update on delay).
4. **Database:** Atlas point-in-time restore only if schema/index change caused issue — **no destructive migrations** ship with this repo beyond index sync.

## MongoDB Atlas hardening

1. Dedicated database user `darshandesk_app` with `readWrite` on `darshandesk` only.
2. Network access: EC2 elastic IP / NAT egress — **no `0.0.0.0/0` in production**.
3. Enable Atlas backup + PITR.
4. Run `npm run migrate:indexes` after first deploy.

## PM2 logs

Logs configured in `deploy/ecosystem.config.cjs` → `/var/log/darshandesk/`. Create directory:

```bash
sudo mkdir -p /var/log/darshandesk && sudo chown $USER /var/log/darshandesk
```

## Vercel dashboard

1. Import repo, root directory `client`.
2. Build: `npm run build` (or use `vercel.json`).
3. Env: `VITE_API_BASE_URL=https://api.example.com`.
4. Add production domain; ensure API `CORS_ORIGINS` includes Vercel URL.