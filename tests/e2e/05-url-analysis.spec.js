const { test, expect } = require('@playwright/test');
const { urlFixture } = require('../fixtures/mock-responses');

test.describe('URL Analysis', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/workspaces', async route => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'test1234' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('**/analyze/url', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(urlFixture) })
    );
    await page.goto('/');
    await page.locator('.input-tab').filter({ hasText: 'URL' }).click();
  });

  test('URL tab shows input field', async ({ page }) => {
    await expect(page.locator('.input-tab.active')).toContainText('URL');
    await expect(page.locator('.input-field')).toBeVisible();
  });

  test('submitting empty URL shows error', async ({ page }) => {
    await page.locator('.btn-primary').click();
    await expect(page.locator('.error-toast')).toContainText('Enter a URL');
  });

  test('submitting valid URL transitions to results', async ({ page }) => {
    await page.locator('.input-field').fill('https://arxiv.org/abs/2005.11401');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.results-page')).toBeVisible({ timeout: 10000 });
  });

  test('results title comes from fixture response', async ({ page }) => {
    await page.locator('.input-field').fill('https://arxiv.org/abs/2005.11401');
    await page.locator('.btn-primary').click();
    // ResultsPage shows source || title; urlFixture.source = 'url' takes priority
    await expect(page.locator('.results-title')).toContainText(urlFixture.source, { timeout: 10000 });
  });

  test('Enter key in URL field submits form', async ({ page }) => {
    await page.locator('.input-field').fill('https://arxiv.org/abs/2005.11401');
    await page.locator('.input-field').press('Enter');
    await expect(page.locator('.results-page')).toBeVisible({ timeout: 10000 });
  });
});
