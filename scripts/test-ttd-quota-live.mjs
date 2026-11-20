import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../server/.env') });

const base = (process.env.TTD_API_BASE_URL || 'https://tirupatibalaji.ap.gov.in').replace(/\/$/, '');
const token = process.env.TTD_INTEGRATION_AUTH_TOKEN;
const userId = process.env.TTD_INTEGRATION_USER_ID;
const url = `${base}/dms/darshansummarySrivaniCurrentDay`;

if (!token) {
  console.error('TTD_INTEGRATION_AUTH_TOKEN not set in server/.env');
  process.exit(1);
}

const headers = {
  Accept: 'application/json, text/plain, */*',
  'ttd-auth-token': token,
  Origin: base,
  Referer: `${base}/`,
};
if (userId) headers.userId = String(userId);

const res = await fetch(url, { method: 'GET', headers, redirect: 'manual' });
const body = await res.text();
let summary = body.slice(0, 400);
try {
  const j = JSON.parse(body);
  summary = JSON.stringify(j, null, 2).slice(0, 800);
} catch {
  /* not json */
}

console.log('URL:', url);
console.log('HTTP status:', res.status, res.statusText);
console.log('Location header:', res.headers.get('location') || '—');
console.log('Body preview:\n', summary);
if (res.status === 401) console.log('\nResult: 401 Unauthorized (Bearer-only or missing/wrong token)');
else if (res.status === 302) console.log('\nResult: 302 redirect — token may be expired or session invalid (often -> /serverError)');
else if (res.status === 200) console.log('\nResult: OK — live quota JSON received');
else console.log('\nResult: unexpected — check token freshness from a new login');