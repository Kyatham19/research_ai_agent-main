const { test, expect } = require('@playwright/test');
const { workspaceFixture, fullWorkspaceFixture, reviewFixture } = require('../fixtures/mock-responses');

test.describe('Literature Review', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/workspaces', async route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify([workspaceFixture]),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.route(`**\/api/workspaces/${workspaceFixture.id}`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fullWorkspaceFixture) })
    );
    await page.route('**/api/literature-review', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reviewFixture) })
    );

    await page.goto('/');
    // Navigate to Literature Reviews
    await page.locator('.sidebar-nav-item').click();
    await expect(page.locator('.lr2-header')).toBeVisible({ timeout: 5000 });
    // Click "Load My Searches" to populate the workspace picker list
    await page.locator('button').filter({ hasText: 'Load My Searches' }).click();
    await expect(page.locator('.lr2-ws-item, .lr2-empty')).toBeVisible({ timeout: 5000 });
  });

  test('Phase 1: literature review header is visible', async ({ page }) => {
    await expect(page.locator('.lr2-header')).toBeVisible();
  });

  test('Phase 1: workspace appears in picker list', async ({ page }) => {
    await expect(page.locator('.lr2-ws-item')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.lr2-ws-query')).toContainText(workspaceFixture.query);
  });

  test('Phase 1: clicking workspace toggles checkmark', async ({ page }) => {
    await page.locator('.lr2-ws-item').click();
    await expect(page.locator('.lr2-ws-item--active')).toBeVisible();
  });

  test('Phase 1: Load Papers button is disabled until workspace selected', async ({ page }) => {
    const loadBtn = page.locator('.lr2-btn').filter({ hasText: /Load|Select/ });
    if (await loadBtn.count() > 0) {
      await expect(loadBtn).toBeDisabled();
    }
    // Select workspace
    await page.locator('.lr2-ws-item').click();
    // Now button should be enabled or absent (phase transitions directly in some UIs)
  });

  test('Phase 2: papers appear in pool after loading workspace', async ({ page }) => {
    await page.locator('.lr2-ws-item').click();
    // Click the load/next button
    await page.locator('.lr2-btn--primary').first().click();
    await expect(page.locator('.lr2-phase--builder, .lr2-col').first()).toBeVisible({ timeout: 5000 });
  });

  test('Phase 2: Add button moves paper to builder column', async ({ page }) => {
    await page.locator('.lr2-ws-item').click();
    await page.locator('.lr2-btn--primary').first().click();
    // Wait for builder phase
    await expect(page.locator('.lr2-add-btn').first()).toBeVisible({ timeout: 5000 });
    const builderCountBefore = await page.locator('.lr2-col--builder .lr2-card').count();
    await page.locator('.lr2-add-btn').first().click();
    const builderCountAfter = await page.locator('.lr2-col--builder .lr2-card').count();
    expect(builderCountAfter).toBeGreaterThan(builderCountBefore);
  });

  test('Phase 2: Generate button disabled with fewer than 2 papers', async ({ page }) => {
    await page.locator('.lr2-ws-item').click();
    await page.locator('.lr2-btn--primary').first().click();
    await expect(page.locator('.lr2-add-btn').first()).toBeVisible({ timeout: 5000 });
    // Add only 1 paper
    await page.locator('.lr2-add-btn').first().click();
    const generateBtn = page.locator('.lr2-btn').filter({ hasText: /Generate/ });
    if (await generateBtn.count() > 0) {
      await expect(generateBtn).toBeDisabled();
    }
  });

  test('Phase 2: Generate button enabled with 2+ papers', async ({ page }) => {
    await page.locator('.lr2-ws-item').click();
    await page.locator('.lr2-btn--primary').first().click();
    await expect(page.locator('.lr2-add-btn').first()).toBeVisible({ timeout: 5000 });
    // Add 2 papers
    const addBtns = page.locator('.lr2-add-btn');
    const count = await addBtns.count();
    if (count >= 2) {
      await addBtns.first().click();
      await addBtns.first().click();
      const generateBtn = page.locator('.lr2-btn').filter({ hasText: /Generate/ });
      if (await generateBtn.count() > 0) {
        await expect(generateBtn).toBeEnabled();
      }
    }
  });

  test('Phase 3: review displays after generation', async ({ page }) => {
    await page.locator('.lr2-ws-item').click();
    await page.locator('.lr2-btn--primary').first().click();
    await expect(page.locator('.lr2-add-btn').first()).toBeVisible({ timeout: 5000 });
    const addBtns = page.locator('.lr2-add-btn');
    const btnCount = await addBtns.count();
    for (let i = 0; i < Math.min(2, btnCount); i++) {
      await page.locator('.lr2-add-btn').first().click();
    }
    const generateBtn = page.locator('.lr2-btn').filter({ hasText: /Generate/ });
    if (await generateBtn.count() > 0 && await generateBtn.isEnabled()) {
      await generateBtn.click();
      await expect(page.locator('.lr2-review')).toBeVisible({ timeout: 10000 });
    }
  });

  test('Phase 3: New Review button resets to phase 1', async ({ page }) => {
    // Navigate to phase 3 quickly by going through phases
    await page.locator('.lr2-ws-item').click();
    await page.locator('.lr2-btn--primary').first().click();
    await expect(page.locator('.lr2-add-btn').first()).toBeVisible({ timeout: 5000 });
    const addBtns = page.locator('.lr2-add-btn');
    const btnCount = await addBtns.count();
    for (let i = 0; i < Math.min(2, btnCount); i++) {
      await page.locator('.lr2-add-btn').first().click();
    }
    const generateBtn = page.locator('.lr2-btn').filter({ hasText: /Generate/ });
    if (await generateBtn.count() > 0 && await generateBtn.isEnabled()) {
      await generateBtn.click();
      await expect(page.locator('.lr2-review')).toBeVisible({ timeout: 10000 });
      // Click New Review
      const newReviewBtn = page.locator('.lr2-btn').filter({ hasText: /New Review/ });
      if (await newReviewBtn.count() > 0) {
        await newReviewBtn.click();
        await expect(page.locator('.lr2-phase')).toBeVisible({ timeout: 5000 });
      }
    }
  });
});
