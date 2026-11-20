import type { Page } from '@playwright/test';

/** Navigate mock booking site and open the pilgrims step after client render. */
export async function openMockPilgrimsStep(page: Page, query = 'pilgrims=2') {
  const jsLoad = page.waitForResponse((r) => r.url().includes('mock-form.js') && r.status() === 200, {
    timeout: 25_000,
  });
  await page.goto(`/mock-booking/?${query}`);
  await jsLoad.catch(() => null);
  await page.waitForFunction(() => document.querySelectorAll('button[data-step]').length >= 3, undefined, {
    timeout: 25_000,
  });
  await page.locator('button[data-step="pilgrims"]').click();
  await page.waitForSelector('[data-dd-field="pilgrim-0-fullName"]', { timeout: 20_000 });
}

export async function openMockConfirmStep(page: Page, query = 'pilgrims=1') {
  const jsLoad = page.waitForResponse((r) => r.url().includes('mock-form.js') && r.status() === 200, {
    timeout: 25_000,
  });
  await page.goto(`/mock-booking/?${query}`);
  await jsLoad.catch(() => null);
  await page.waitForFunction(() => document.querySelectorAll('button[data-step]').length >= 3, undefined, {
    timeout: 25_000,
  });
  await page.locator('button[data-step="confirm"]').click();
  await page.waitForSelector('#toggle-captcha', { timeout: 20_000 });
}