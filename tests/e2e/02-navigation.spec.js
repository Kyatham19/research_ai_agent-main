const { test, expect } = require('@playwright/test');

test.describe('Navigation and Home View', () => {
  test.beforeEach(async ({ page }) => {
    // Mock workspace list so sidebar doesn't show real workspaces
    await page.route('**/api/workspaces', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await page.goto('/');
  });

  test('home page loads with hero heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Analyze Research Papers with AI');
  });

  test('feature pills are visible', async ({ page }) => {
    await expect(page.locator('.feature-pill').first()).toBeVisible();
  });

  test('all four input mode tabs are present', async ({ page }) => {
    const tabs = page.locator('.input-tab');
    await expect(tabs).toHaveCount(4);
    await expect(tabs.nth(0)).toContainText('Topic Search');
    await expect(tabs.nth(1)).toContainText('PDF Upload');
    await expect(tabs.nth(2)).toContainText('URL');
    await expect(tabs.nth(3)).toContainText('Paste Text');
  });

  test('Topic Search tab is active by default', async ({ page }) => {
    await expect(page.locator('.input-tab.active')).toContainText('Topic Search');
  });

  test('clicking PDF Upload tab makes it active', async ({ page }) => {
    await page.locator('.input-tab').filter({ hasText: 'PDF Upload' }).click();
    await expect(page.locator('.input-tab.active')).toContainText('PDF Upload');
  });

  test('clicking URL tab makes it active', async ({ page }) => {
    await page.locator('.input-tab').filter({ hasText: 'URL' }).click();
    await expect(page.locator('.input-tab.active')).toContainText('URL');
  });

  test('clicking Paste Text tab makes it active', async ({ page }) => {
    await page.locator('.input-tab').filter({ hasText: 'Paste Text' }).click();
    await expect(page.locator('.input-tab.active')).toContainText('Paste Text');
  });

  test('sidebar is visible on load', async ({ page }) => {
    await expect(page.locator('.sidebar')).toBeVisible();
  });

  test('sidebar can be collapsed', async ({ page }) => {
    await expect(page.locator('.sidebar--collapsed')).toHaveCount(0);
    // Click the collapse button (sidebar icon button inside sidebar-brand)
    await page.locator('.sidebar-icon-btn').first().click();
    await expect(page.locator('.sidebar--collapsed')).toBeVisible();
  });

  test('collapsed sidebar can be expanded', async ({ page }) => {
    // Collapse first
    await page.locator('.sidebar-icon-btn').first().click();
    await expect(page.locator('.sidebar--collapsed')).toBeVisible();
    // The first .collapsed-nav-btn in collapsed sidebar sets collapsed=false
    await page.locator('.sidebar--collapsed .collapsed-nav-btn').first().click();
    await expect(page.locator('.sidebar--collapsed')).toHaveCount(0);
  });

  test('Literature Reviews nav item is present in sidebar', async ({ page }) => {
    await expect(page.locator('.sidebar-nav-item')).toContainText('Literature Reviews');
  });

  test('clicking Literature Reviews navigates to literature view', async ({ page }) => {
    await page.locator('.sidebar-nav-item').click();
    // Literature review page should show its header
    await expect(page.locator('.lr2-header')).toBeVisible({ timeout: 5000 });
  });
});
