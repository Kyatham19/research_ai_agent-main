const { test, expect } = require('@playwright/test');
const { topicResultFixture } = require('../fixtures/mock-responses');

// Helper: navigate to results page via mocked topic search
async function goToResults(page) {
  await page.route('**/api/workspaces', async route => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'test1234' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/analyze/topic', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(topicResultFixture) })
  );
  await page.goto('/');
  await page.locator('.input-tab').filter({ hasText: 'Topic Search' }).click();
  await page.locator('.input-field').first().fill('transformers');
  await page.locator('.btn-primary').click();
  await expect(page.locator('.results-page')).toBeVisible({ timeout: 10000 });
}

test.describe('Results Page', () => {
  test('combined view tab is active by default', async ({ page }) => {
    await goToResults(page);
    const activeTabs = page.locator('.view-tab.active');
    await expect(activeTabs).toContainText('Combined');
  });

  test('switching to compare tab renders comparison table', async ({ page }) => {
    await goToResults(page);
    await page.locator('.view-tab').filter({ hasText: 'Compare' }).click();
    await expect(page.locator('.compare-table')).toBeVisible({ timeout: 5000 });
  });

  test('comparison table has correct number of paper rows', async ({ page }) => {
    await goToResults(page);
    await page.locator('.view-tab').filter({ hasText: 'Compare' }).click();
    // 2 papers in fixture = 2 data rows (thead + 2 tbody rows)
    const rows = page.locator('.compare-table tbody tr');
    await expect(rows).toHaveCount(2, { timeout: 5000 });
  });

  test('switching to papers tab renders paper cards', async ({ page }) => {
    await goToResults(page);
    await page.locator('.view-tab').filter({ hasText: 'Papers' }).click();
    await expect(page.locator('.paper-card').first()).toBeVisible({ timeout: 5000 });
  });

  test('papers tab shows correct number of paper cards', async ({ page }) => {
    await goToResults(page);
    await page.locator('.view-tab').filter({ hasText: 'Papers' }).click();
    await expect(page.locator('.paper-card')).toHaveCount(2, { timeout: 5000 });
  });

  test('summary section is visible by default', async ({ page }) => {
    await goToResults(page);
    const summarySection = page.locator('.section-card').filter({ hasText: 'Summary' }).first();
    await expect(summarySection).toBeVisible();
    await expect(summarySection.locator('.section-toggle')).toHaveClass(/open/);
  });

  test('clicking a closed section header opens it', async ({ page }) => {
    await goToResults(page);
    // Find a section not open by default (Methods)
    const methodsSection = page.locator('.section-card').filter({ hasText: 'Methods' }).first();
    const toggle = methodsSection.locator('.section-toggle');
    await methodsSection.locator('.section-head').click();
    await expect(toggle).toHaveClass(/open/);
  });

  test('clicking an open section header closes it', async ({ page }) => {
    await goToResults(page);
    // Summary is open by default
    const summarySection = page.locator('.section-card').filter({ hasText: 'Summary' }).first();
    await summarySection.locator('.section-head').click();
    await expect(summarySection.locator('.section-toggle')).not.toHaveClass(/open/);
  });

  test('expand button on paper card reveals details', async ({ page }) => {
    await goToResults(page);
    await page.locator('.view-tab').filter({ hasText: 'Papers' }).click();
    const firstCard = page.locator('.paper-card').first();
    await firstCard.locator('.expand-btn').click();
    await expect(firstCard.locator('.paper-details')).toBeVisible({ timeout: 3000 });
  });

  test('stats row shows numeric values', async ({ page }) => {
    await goToResults(page);
    const statsRow = page.locator('.stats-row');
    await expect(statsRow).toBeVisible();
    // Combined view shows combined_analysis.stats; word_count=14400 renders as "14,400"
    await expect(statsRow).toContainText('14,400');
  });

  test('New Search button navigates back to home', async ({ page }) => {
    await goToResults(page);
    await page.locator('.btn-outline').click();
    await expect(page.locator('.home')).toBeVisible();
  });
});
