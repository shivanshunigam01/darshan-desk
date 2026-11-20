# EC2 (Ubuntu) + Nginx — DarshanDesk production API

Replace `api.example.com` and `darshandesk.example.com` with your domains. Use **MongoDB Atlas** (not Mongo on EC2).

## 1) One-time on a new Ubuntu 22.04/24.04 EC2

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx certbot python3-certbot-nginx git build-essential

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v

# PM2
sudo npm install -g pm2
sudo mkdir -p /var/log/darshandesk
sudo chown -R $USER:$USER /var/log/darshandesk
```

**Security groups:** open **22** (your IP only), **80**, **443**. Do **not** expose port **4000** publicly.

**Atlas:** allow EC2 **elastic IP** (or NAT egress) in Network Access.

## 2) Clone and build (on EC2)

```bash
cd ~
git clone https://github.com/YOUR_USER/darshan-desk.git
cd darshan-desk

npm ci

# Build workspace packages the API imports
npm run build -w @darshan-desk/quota
npm run build -w @darshan-desk/fill-engine
npm run build -w @darshan-desk/reliability
npm run build -w @darshan-desk/ttd-integration

cp server/.env.production.example server/.env
nano server/.env   # set MONGODB_URI, JWT_SECRET, CORS_ORIGINS, etc.
```

**`server/.env` essentials:**

```env
NODE_ENV=production
PORT=4000
TRUST_PROXY_HOPS=1
MONGODB_URI=mongodb+srv://...
JWT_SECRET=...   # openssl rand -hex 32
CORS_ORIGINS=https://darshandesk.example.com
CLIENT_ORIGIN=https://darshandesk.example.com
SEED_ON_START=false
```

```bash
npm run migrate:indexes

pm2 start deploy/ecosystem.config.cjs --env production
pm2 save
pm2 startup    # run the printed sudo command once
```

Smoke test locally on the box:

```bash
curl -s http://127.0.0.1:4000/health | jq
```

## 3) Nginx — API only

```bash
sudo cp ~/darshan-desk/deploy/nginx/darshandesk-api.conf /etc/nginx/sites-available/darshandesk-api
sudo sed -i 's/api.example.com/api.YOURDOMAIN.com/g' /etc/nginx/sites-available/darshandesk-api
sudo ln -sf /etc/nginx/sites-available/darshandesk-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

TLS:

```bash
sudo certbot --nginx -d api.YOURDOMAIN.com
```

Public check:

```bash
curl -s https://api.YOURDOMAIN.com/health
```

## 4) Nginx — landing page + extension ZIP (optional)

Build extension on your laptop or CI, copy ZIP to the server:

```bash
# On your PC (set your real API URL)
export DD_PRODUCTION_API_ORIGIN=https://api.YOURDOMAIN.com
npm run build:production -w @darshan-desk/extension

scp apps/extension/release/darshandesk-extension-v1.0.0.zip \
  ubuntu@EC2_IP:~/darshan-desk/apps/landing/downloads/
```

On EC2:

```bash
sudo mkdir -p /var/www/darshandesk/downloads
sudo cp -r ~/darshan-desk/apps/landing/* /var/www/darshandesk/
sudo chown -R www-data:www-data /var/www/darshandesk

sudo cp ~/darshan-desk/deploy/nginx/darshandesk-site.conf /etc/nginx/sites-available/darshandesk-site
sudo sed -i 's/darshandesk.example.com/www.YOURDOMAIN.com/g' /etc/nginx/sites-available/darshandesk-site
sudo ln -sf /etc/nginx/sites-available/darshandesk-site /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d www.YOURDOMAIN.com
```

## 5) Point the extension at production

1. Build with `DD_PRODUCTION_API_ORIGIN=https://api.YOURDOMAIN.com` (adds `host_permissions` in the manifest).
2. Operators install the ZIP (landing page) or Chrome Web Store build.
3. **Settings → API base URL** = `https://api.YOURDOMAIN.com` (if not baked into the build).

## 6) Deploy updates

```bash
cd ~/darshan-desk
git pull
npm ci
npm run build -w @darshan-desk/quota
npm run build -w @darshan-desk/fill-engine
npm run build -w @darshan-desk/reliability
npm run build -w @darshan-desk/ttd-integration
pm2 restart darshandesk-api
```

## Extension hosting options

| Method | Best for |
|--------|----------|
| **Landing page ZIP** (`apps/landing/`) | Agencies / private beta |
| **Chrome Web Store** | Public distribution — see [EXTENSION_PUBLISHING.md](./EXTENSION_PUBLISHING.md) |
| **GitHub Releases** | Attach `darshandesk-extension-v1.0.0.zip`; link from landing |

Chrome does **not** host extensions on your server like a normal website — users install via Store or **Load unpacked** / enterprise policy. Your landing page provides the **download + install steps**.