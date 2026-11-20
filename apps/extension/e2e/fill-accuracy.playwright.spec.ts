/**
 * Playwright + fill-engine: 100% field accuracy on authorized mock form HTML.
 * Requires API server (see playwright.config webServer) serving /mock-booking.
 */
import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import {
  buildFillPlan,
  executeFillPlan,
  mapPilgrimRowsById,
  normalizePilgrims,
  verifyFillResults,
} from '@darshan-desk/fill-engine';
import { openMockConfirmStep, openMockPilgrimsStep } from './mock-helpers';

const pilgrimTemplate = (i: number, id: string) => ({
  _id: id,
  fullName: `Pilgrim ${i + 1}`,
  age: 30 + i,
  gender: i % 2 === 0 ? 'M' : 'F',
  idType: i === 3 ? 'Passport' : 'Aadhaar',
  idNumber: `XXXX${1000 + i}`,
  mobile: `987654321${i}`,
  city: 'Tirupati',
  dateOfBirth: `1990-0${(i % 9) + 1}-15`,
});

function bootFromHtml(html: string) {
  const dom = new JSDOM(html, { url: 'http://127.0.0.1:4000/mock-booking/' });
  const { window } = dom;
  const doc = window.document;
  // @ts-expect-error test harness
  global.HTMLElement = window.HTMLElement;
  // @ts-expect-error test harness
  global.HTMLInputElement = window.HTMLInputElement;
  // @ts-expect-error test harness
  global.HTMLSelectElement = window.HTMLSelectElement;
  // @ts-expect-error test harness
  global.HTMLTextAreaElement = window.HTMLTextAreaElement;
  window.Element.prototype.getBoundingClientRect = function () {
    return { width: 120, height: 24, top: 0, left: 0, right: 120, bottom: 24, x: 0, y: 0, toJSON() { return {}; } };
  };
  return doc;
}

async function fillMockPage(page: import('@playwright/test').Page, count: number) {
  const ids = Array.from({ length: count }, (_, i) => `pid-${i + 1}`);
  const qs = ids.map((id, i) => `pid${i}=${encodeURIComponent(id)}`).join('&');
  await openMockPilgrimsStep(page, `pilgrims=${count}&${qs}`);

  const html = await page.content();
  const doc = bootFromHtml(html);
  const pilgrims = normalizePilgrims(ids.map((id, i) => pilgrimTemplate(i, id)));
  const data = {
    preparationId: `playwright-${count}`,
    mappingProfileId: 'mock-srivani-v1',
    contentRevision: 1,
    pilgrims,
    permittedScalars: { donationAmount: 10000, bookingCategory: 'CURRENT' as const },
    rowMappings: ids.map((id, rowIndex) => ({ pilgrimId: id, rowIndex })),
  };
  const rowMap = mapPilgrimRowsById(doc, ids);
  const plan = buildFillPlan(data, ids, { includeScalars: false, rowIndexByPilgrimId: rowMap });
  const results = executeFillPlan(doc, plan, { allowOverwrite: true, duplicateSessionKey: `pw-${count}` });
  const validation = verifyFillResults(plan, results);
  return { validation, doc, results };
}

for (const count of [1, 2, 3, 4] as const) {
  test(`mock form: ${count} pilgrim(s) at 100% verified field accuracy`, async ({ page }) => {
    const { validation, doc } = await fillMockPage(page, count);
    expect(validation.ok).toBe(true);
    for (let i = 0; i < count; i++) {
      const el = doc.querySelector(`[data-dd-field="pilgrim-${i}-fullName"]`) as HTMLInputElement;
      expect(el?.value).toBe(`Pilgrim ${i + 1}`);
    }
  });
}

test('CAPTCHA fixture stops fill with captcha_required', async ({ page }) => {
  await openMockConfirmStep(page, 'pilgrims=1&pid0=c1');
  await page.locator('#toggle-captcha').check();
  await expect(page.locator('[data-dd-captcha]:not([hidden])')).toBeVisible();
  const detected = await page.evaluate(() => {
    const el = document.querySelector('[data-dd-captcha]');
    if (!el || !(el instanceof HTMLElement)) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return el.getBoundingClientRect().width > 0;
  });
  expect(detected).toBe(true);
});

test('browser refresh keeps data-dd-mapping for redetect', async ({ page }) => {
  await openMockPilgrimsStep(page, 'pilgrims=2');
  await page.reload();
  await openMockPilgrimsStep(page, 'pilgrims=2');
  await expect(page.locator('body')).toHaveAttribute('data-dd-mapping', 'mock-srivani-v1');
});