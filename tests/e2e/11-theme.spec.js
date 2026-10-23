const { test, expect } = require('@playwright/test');

test.describe('Theme Toggle and Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/workspaces', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
  });

  test('default theme is dark', async ({ page }) => {
    await page.goto('/');
    const theme = await page.locator('html').getAttribute('data-theme');
    expect(theme).toBe('dark');
  });

  test('clicking theme toggle switches to light', async ({ page }) => {
    await page.goto('/');
    await page.locator('.sidebar-footer-btn').click();
    const theme = await page.locator('html').getAttribute('data-theme');
    expect(theme).toBe('light');
  });

  test('clicking theme toggle twice returns to dark', async ({ page }) => {
    await page.goto('/');
    await page.locator('.sidebar-footer-btn').click();
    await page.locator('.sidebar-footer-btn').click();
    const theme = await page.locator('html').getAttribute('data-theme');
    expect(theme).toBe('dark');
  });

  test('theme is persisted in localStorage', async ({ page }) => {
    await page.goto('/');
    await page.locator('.sidebar-footer-btn').click();
    const stored = await page.evaluate(() => localStorage.getItem('rai-theme'));
    expect(stored).toBe('light');
  });

  test('theme persists across page reload', async ({ page }) => {
    await page.goto('/');
    await page.locator('.sidebar-footer-btn').click();
    await expect(page.locator('html[data-theme="light"]')).toBeVisible();

    await page.reload();
    await page.route('**/api/workspaces', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    const theme = await page.locator('html').getAttribute('data-theme');
    expect(theme).toBe('light');
  });

  test('light theme class is applied to html element', async ({ page }) => {
    await page.goto('/');
    await page.locator('.sidebar-footer-btn').click();
    await expect(page.locator('html[data-theme="light"]')).toHaveCount(1);
  });

  test('dark theme class restores after second toggle', async ({ page }) => {
    await page.goto('/');
    await page.locator('.sidebar-footer-btn').click(); // → light
    await page.locator('.sidebar-footer-btn').click(); // → dark
    await expect(page.locator('html[data-theme="dark"]')).toHaveCount(1);
  });
});
