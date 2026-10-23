const { test, expect } = require('@playwright/test');

test.describe('Error States', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/workspaces', async route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'test1234' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
  });

  test('server error shows error toast', async ({ page }) => {
    await page.route('**/analyze/topic', route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Internal server error' }) })
    );
    await page.goto('/');
    await page.locator('.input-field').first().fill('test topic');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.error-toast')).toBeVisible({ timeout: 10000 });
  });

  test('error toast can be dismissed with close button', async ({ page }) => {
    await page.route('**/analyze/topic', route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Server error' }) })
    );
    await page.goto('/');
    await page.locator('.input-field').first().fill('test topic');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.error-toast')).toBeVisible({ timeout: 10000 });
    await page.locator('.error-toast button').click();
    await expect(page.locator('.error-toast')).toHaveCount(0);
  });

  test('empty workspace list shows sidebar-empty state', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.sidebar-empty')).toBeVisible({ timeout: 5000 });
  });

  test('sidebar-empty shows "No research yet" title', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.sidebar-empty-title')).toContainText('No research yet');
  });

  test('sidebar-empty shows prompt to start', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.sidebar-empty-sub')).toContainText('Start your first search');
  });

  test('validation error for empty topic is dismissable', async ({ page }) => {
    await page.goto('/');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.error-toast')).toBeVisible();
    await page.locator('.error-toast button').click();
    await expect(page.locator('.error-toast')).toHaveCount(0);
  });

  test('backend 404 response shows error', async ({ page }) => {
    await page.route('**/analyze/topic', route =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'No papers found for this topic' }) })
    );
    await page.goto('/');
    await page.locator('.input-field').first().fill('zyxwvut impossible topic');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.error-toast')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.error-toast')).toContainText('No papers found');
  });

  test('URL tab empty submit shows error', async ({ page }) => {
    await page.goto('/');
    await page.locator('.input-tab').filter({ hasText: 'URL' }).click();
    await page.locator('.btn-primary').click();
    await expect(page.locator('.error-toast')).toContainText('Enter a URL');
  });

  test('Text tab empty submit shows error', async ({ page }) => {
    await page.goto('/');
    await page.locator('.input-tab').filter({ hasText: 'Paste Text' }).click();
    await page.locator('.btn-primary').click();
    await expect(page.locator('.error-toast')).toContainText('Paste some text');
  });
});
