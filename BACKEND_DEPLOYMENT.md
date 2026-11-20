# Backend deployment (minimal API)

## Run locally

```bash
cd server
cp .env.example .env   # if present; configure MONGODB_URI, JWT_SECRET
npm run dev -w server  # from repo root: npm run dev:api
```

## Required env

- `MONGODB_URI`
- `JWT_SECRET`
- `CLIENT_ORIGIN` (optional while dashboard archived)
- `TTD_INTEGRATION_*` only if live quota bridge needed

## Extension-first note

Default root `npm run dev` starts **API + extension watch** (`vite` in `apps/extension`), not the React dashboard.