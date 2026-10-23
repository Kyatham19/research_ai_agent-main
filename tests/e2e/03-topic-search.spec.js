const { test, expect } = require('@playwright/test');
const { topicResultFixture } = require('../fixtures/mock-responses');

test.describe('Topic Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/workspaces', async route => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 201, contentType: 'application/json',
          body: JSON.stringify({ id: 'test1234', query: 'test', created_at: new Date().toISOString(), favorite: false, paper_count: 0, mode: 'topic' }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('**/analyze/topic', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(topicResultFixture) })
    );
    await page.goto('/');
    // Ensure Topic Search tab is active
    await page.locator('.input-tab').filter({ hasText: 'Topic Search' }).click();
  });

  test('submitting empty topic shows error toast', async ({ page }) => {
    await page.locator('.btn-primary').click();
    await expect(page.locator('.error-toast')).toBeVisible();
    await expect(page.locator('.error-toast')).toContainText('Enter a topic');
  });

  test('papers slider shows current value', async ({ page }) => {
    const slider = page.locator('input[type="range"]');
    await expect(slider).toBeVisible();
    await expect(page.locator('.slider-val')).toBeVisible();
  });

  test('slider value updates when changed', async ({ page }) => {
    const slider = page.locator('input[type="range"]');
    // React synthetic onChange uses native value setter + input event
    await slider.evaluate(el => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, '8');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.locator('.slider-val')).toContainText('8');
  });

  test('submitting topic disables button during loading', async ({ page }) => {
    // Add delay to mock so we can catch the loading state
    await page.route('**/analyze/topic', async route => {
      await new Promise(r => setTimeout(r, 500));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(topicResultFixture) });
    });
    const input = page.locator('.input-field').first();
    await input.fill('Retrieval-Augmented Generation');
    const btn = page.locator('.btn-primary');
    await btn.click();
    await expect(btn).toBeDisabled();
  });

  test('successful topic search transitions to results page', async ({ page }) => {
    const input = page.locator('.input-field').first();
    await input.fill('Retrieval-Augmented Generation');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.results-page')).toBeVisible({ timeout: 10000 });
  });

  test('results page shows topic title', async ({ page }) => {
    const input = page.locator('.input-field').first();
    await input.fill('Retrieval-Augmented Generation');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.results-title')).toBeVisible({ timeout: 10000 });
  });

  test('results label shows paper count', async ({ page }) => {
    const input = page.locator('.input-field').first();
    await input.fill('Retrieval-Augmented Generation');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.results-label')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.results-label')).toContainText('2');
  });

  test('Enter key submits topic search', async ({ page }) => {
    const input = page.locator('.input-field').first();
    await input.fill('Retrieval-Augmented Generation');
    await input.press('Enter');
    await expect(page.locator('.results-page')).toBeVisible({ timeout: 10000 });
  });

  test('New Search button returns to home', async ({ page }) => {
    const input = page.locator('.input-field').first();
    await input.fill('Retrieval-Augmented Generation');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.results-page')).toBeVisible({ timeout: 10000 });
    await page.locator('.btn-outline').click();
    await expect(page.locator('.home')).toBeVisible();
  });
});
