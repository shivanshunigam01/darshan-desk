# Production commands — EC2 (Ubuntu) + PM2 + Nginx + Certbot

**Repo:** https://github.com/shivanshunigam01/darshan-desk.git  

Replace:

| Placeholder | Example |
|-------------|---------|
| `api.YOURDOMAIN.com` | `api.darshandesk.in` |
| `www.YOURDOMAIN.com` | `darshandesk.in` or `www.darshandesk.in` |
| `EC2_IP` | Elastic IP of your instance |

Use **MongoDB Atlas** (free tier is fine). Do **not** open port **4000** on the security group — only **22**, **80**, **443**.

---

## A) On your Windows PC (before / after deploy)

```powershell
cd C:\Users\Admin\Desktop\TTD

# Production extension build (bakes API host into manifest host_permissions)
$env:DD_PRODUCTION_API_ORIGIN="https://api.YOURDOMAIN.com"
npm run build:production -w @darshan-desk/extension

# Copy ZIP for landing page (optional — upload to EC2 instead)
Copy-Item apps\extension\release\darshandesk-extension-v1.0.0.zip apps\landing\downloads\
```

Upload ZIP to EC2:

```powershell
scp apps\extension\release\darshandesk-extension-v1.0.0.zip ubuntu@EC2_IP:~/darshandesk-extension-v1.0.0.zip
```

---

## B) One-time EC2 setup (Ubuntu 22.04 / 24.04)

SSH in:

```bash
ssh -i your-key.pem ubuntu@EC2_IP
```

Install stack:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx certbot python3-certbot-nginx git build-essential jq

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v

sudo npm install -g pm2
sudo mkdir -p /var/log/darshandesk
sudo chown -R $USER:$USER /var/log/darshandesk
```

**Atlas:** Network Access → add EC2 **public IP**. Database user with read/write on `darshandesk` DB.

---

## C) Clone, configure API, PM2

```bash
cd ~
git clone https://github.com/shivanshunigam01/darshan-desk.git
cd darshan-desk

npm ci

npm run build -w @darshan-desk/quota
npm run build -w @darshan-desk/fill-engine
npm run build -w @darshan-desk/reliability
npm run build -w @darshan-desk/ttd-integration

cp server/.env.production.example server/.env
nano server/.env
```

Set at minimum in `server/.env`:

```env
NODE_ENV=production
PORT=4000
TRUST_PROXY_HOPS=1
MONGODB_URI=mongodb+srv://USER:PASS@cluster....mongodb.net/darshandesk
JWT_SECRET=PASTE_OUTPUT_OF_openssl_rand_hex_32
CORS_ORIGINS=https://www.YOURDOMAIN.com
CLIENT_ORIGIN=https://www.YOURDOMAIN.com
SEED_ON_START=false
```

Generate JWT secret:

```bash
openssl rand -hex 32
```

Indexes + start with **PM2**:

```bash
cd ~/darshan-desk
npm run migrate:indexes

pm2 start deploy/ecosystem.config.cjs --env production
pm2 save
pm2 startup
# Run the sudo command PM2 prints (one time)

pm2 status
curl -s http://127.0.0.1:4000/health
```

---

## D) Nginx + Certbot — API

```bash
sudo cp ~/darshan-desk/deploy/nginx/darshandesk-api.conf /etc/nginx/sites-available/darshandesk-api
sudo sed -i 's/api.example.com/api.YOURDOMAIN.com/g' /etc/nginx/sites-available/darshandesk-api
sudo ln -sf /etc/nginx/sites-available/darshandesk-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d api.YOURDOMAIN.com
```

Test:

```bash
curl -s https://api.YOURDOMAIN.com/health
```

---

## E) Landing page + extension download (optional)

On EC2:

```bash
sudo mkdir -p /var/www/darshandesk/downloads
sudo cp ~/darshan-desk/apps/landing/index.html /var/www/darshandesk/
sudo cp ~/darshandesk-extension-v1.0.0.zip /var/www/darshandesk/downloads/ 2>/dev/null || true
sudo chown -R www-data:www-data /var/www/darshandesk

sudo cp ~/darshan-desk/deploy/nginx/darshandesk-site.conf /etc/nginx/sites-available/darshandesk-site
sudo sed -i 's/darshandesk.example.com/www.YOURDOMAIN.com/g' /etc/nginx/sites-available/darshandesk-site
sudo ln -sf /etc/nginx/sites-available/darshandesk-site /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d www.YOURDOMAIN.com
```

Users open `https://www.YOURDOMAIN.com` → download ZIP → `chrome://extensions` → Load unpacked → sign in.

Point extension **Settings → API URL** to `https://api.YOURDOMAIN.com` if not built with `DD_PRODUCTION_API_ORIGIN`.

---

## F) Deploy updates (git pull on EC2)

```bash
cd ~/darshan-desk
git pull origin main
npm ci
npm run build -w @darshan-desk/quota
npm run build -w @darshan-desk/fill-engine
npm run build -w @darshan-desk/reliability
npm run build -w @darshan-desk/ttd-integration
pm2 restart darshandesk-api
```

---

## G) PM2 handy commands

```bash
pm2 logs darshandesk-api
pm2 restart darshandesk-api
pm2 stop darshandesk-api
pm2 monit
```

---

## How extension “hosting” works

| What | Where |
|------|--------|
| **Backend API** | EC2 + PM2 + Nginx + Certbot → `https://api.YOURDOMAIN.com` |
| **ZIP download** | Nginx static site `apps/landing/` → `/var/www/darshandesk` |
| **Chrome Web Store** | Later — package same `dist` for public listing (see `EXTENSION_PUBLISHING.md`) |

Chrome does **not** install from your API. Users install from your **landing ZIP** or the **Web Store**. The extension then talks to your API over HTTPS.

---

## GitHub (push from your PC)

```powershell
cd C:\Users\Admin\Desktop\TTD
git remote add origin https://github.com/shivanshunigam01/darshan-desk.git
# if origin exists: git remote set-url origin https://github.com/shivanshunigam01/darshan-desk.git

git add -A
git status
git commit -m "Production deploy docs, nginx certbot flow, landing install steps"
git push -u origin main
```

If the GitHub repo is not empty, first time only:

```powershell
git pull origin main --rebase
git push -u origin main
```