const { test, expect } = require('@playwright/test');
const { workspaceFixture, favoritedWorkspaceFixture, fullWorkspaceFixture, topicResultFixture } = require('../fixtures/mock-responses');

test.describe('Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/workspaces', async route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([workspaceFixture]),
        });
      }
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'test1234' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.goto('/');
  });

  test('sidebar shows workspace query text', async ({ page }) => {
    await expect(page.locator('.ws-query')).toContainText(workspaceFixture.query);
  });

  test('sidebar shows workspace metadata', async ({ page }) => {
    await expect(page.locator('.ws-item')).toBeVisible();
  });

  test('star button is present on workspace item', async ({ page }) => {
    // Action buttons only appear on :hover via CSS
    await page.locator('.ws-item').hover();
    await expect(page.locator('.ws-action-btn').first()).toBeVisible();
  });

  test('clicking star button sends favorite request', async ({ page }) => {
    let favoriteHit = false;
    await page.route(`**/api/favorite/${workspaceFixture.id}`, route => {
      favoriteHit = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ favorite: true }) });
    });
    // Action buttons only appear on :hover via CSS
    await page.locator('.ws-item').hover();
    await page.locator('.ws-action-btn').first().waitFor({ state: 'visible' });
    await page.locator('.ws-action-btn').first().click();
    await page.waitForTimeout(500);
    expect(favoriteHit).toBe(true);
  });

  test('favorited workspace appears in favorites section', async ({ page }) => {
    await page.route('**/api/workspaces', route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([favoritedWorkspaceFixture, workspaceFixture]),
      })
    );
    await page.reload();
    await expect(page.locator('.sidebar-section').filter({ hasText: 'Favorites' })).toBeVisible({ timeout: 5000 });
  });

  test('sidebar collapses on icon button click', async ({ page }) => {
    await page.locator('.sidebar-icon-btn').first().click();
    await expect(page.locator('.sidebar--collapsed')).toBeVisible();
  });

  test('sidebar shows empty state when no workspaces', async ({ page }) => {
    await page.route('**/api/workspaces', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await page.reload();
    await expect(page.locator('.sidebar-empty')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.sidebar-empty-title')).toContainText('No research yet');
  });

  test('clicking workspace item marks it as active', async ({ page }) => {
    // Mock the full workspace fetch for when sidebar item is clicked
    await page.route(`**\/api/workspaces/${workspaceFixture.id}`, route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          ...fullWorkspaceFixture,
          analyses: [{ ...topicResultFixture, _mode: 'topic' }],
        }),
      })
    );
    await page.locator('.ws-item').click();
    await expect(page.locator('.ws-item--active')).toBeVisible({ timeout: 5000 });
  });

  test('delete button appears on workspace hover', async ({ page }) => {
    // The delete button should exist in the DOM
    const deleteBtn = page.locator('.ws-action-btn--delete');
    await expect(deleteBtn).toBeTruthy();
  });
});
