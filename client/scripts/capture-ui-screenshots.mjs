/**
 * Capture dashboard + quota screenshots (requires dev stack running on :5173 and :3000).
 * Usage: node client/scripts/capture-ui-screenshots.mjs
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, '../docs/ui-modernization/screenshots');
mkdirSync(outDir, { recursive: true });

const base = process.env.DD_UI_URL || 'http://localhost:5173';
const email = process.env.DD_LOGIN_EMAIL || 'admin@darshandesk.local';
const password = process.env.DD_LOGIN_PASSWORD || 'admin123';

const browser = await chromium.launch({ channel: 'msedge', headless: true }).catch(() =>
  chromium.launch({ headless: true })
);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${base}/login`);
await page.fill('input[type="email"], input[name="email"]', email);
await page.fill('input[type="password"]', password);
await page.click('button[type="submit"]');
await page.waitForURL('**/', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1200);
await page.screenshot({ path: join(outDir, 'agency-dashboard-after.png'), fullPage: true });
await page.goto(`${base}/srivani/quota`);
await page.waitForTimeout(1200);
await page.screenshot({ path: join(outDir, 'srivani-quota-after.png'), fullPage: true });

await browser.close();
console.log('Wrote screenshots to', outDir);