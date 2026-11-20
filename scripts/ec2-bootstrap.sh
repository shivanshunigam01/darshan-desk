#!/usr/bin/env bash
# Run on Ubuntu EC2 from repo root: bash scripts/ec2-bootstrap.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> npm ci (repo root — required for server dotenv, express, etc.)..."
if [[ ! -f package-lock.json ]]; then
  echo "package-lock.json missing — run: git pull origin main"
  exit 1
fi
if ! npm ci; then
  echo "npm ci failed — trying npm install..."
  npm install
fi

echo "==> Ensure server workspace deps..."
npm install -w server --omit=dev

echo "==> Build workspace packages..."
npm run build -w @darshan-desk/quota
npm run build -w @darshan-desk/fill-engine
npm run build -w @darshan-desk/reliability
npm run build -w @darshan-desk/ttd-integration

DOTENV_PATH="$(find node_modules -path '*/dotenv/package.json' -print -quit 2>/dev/null || true)"
if [[ -z "$DOTENV_PATH" ]]; then
  echo "ERROR: dotenv still not installed. Run: npm install dotenv -w server"
  exit 1
fi
echo "Found dotenv at: $(dirname "$DOTENV_PATH")"

if [[ ! -f server/.env ]]; then
  echo "Copy server/.env.production.example to server/.env and edit it first."
  exit 1
fi

echo "==> OK. Start API: pm2 start deploy/ecosystem.config.cjs --env production"