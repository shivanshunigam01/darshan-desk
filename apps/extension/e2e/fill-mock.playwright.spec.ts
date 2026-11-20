/**
 * Playwright suite (requires `npx playwright install` when disk space allows).
 * Targets the local authorized mock at /mock-booking/?pilgrims=N
 */
import { test, expect } from '@playwright/test';
import { openMockConfirmStep, openMockPilgrimsStep } from './mock-helpers';

test.describe('mock pilgrim form', () => {
  test.beforeEach(async ({ page }) => {
    await openMockPilgrimsStep(page, 'pilgrims=2');
  });

  test('exposes verified data-dd-field anchors', async ({ page }) => {
    await expect(page.locator('[data-dd-field="pilgrim-0-fullName"]')).toBeVisible();
    await expect(page.locator('[data-dd-field="pilgrim-1-fullName"]')).toBeVisible();
  });

  test('CAPTCHA fixture blocks when visible', async ({ page }) => {
    await openMockConfirmStep(page, 'pilgrims=1');
    await page.locator('#toggle-captcha').check();
    await expect(page.locator('[data-dd-captcha]:not([hidden])')).toBeVisible();
  });
});