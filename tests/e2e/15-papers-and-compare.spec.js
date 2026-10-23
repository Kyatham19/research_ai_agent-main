/**
 * 15-papers-and-compare.spec.js
 * Deep verification of the Papers tab (card content, badges, expand details,
 * arXiv links) and Compare tab (column headers, row data, badge values).
 */
const { test, expect } = require('@playwright/test');
const { topicResultFixture } = require('../fixtures/mock-responses');

async function goToResults(page) {
  await page.route('**/api/workspaces', async route => {
    if (route.request().method() === 'POST')
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'test1234' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/analyze/topic', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(topicResultFixture) })
  );
  await page.goto('/');
  await page.locator('.input-tab').filter({ hasText: 'Topic Search' }).click();
  await page.locator('.input-field').first().fill('transformer attention');
  await page.locator('.btn-primary').click();
  await expect(page.locator('.results-page')).toBeVisible({ timeout: 10000 });
}

// ── Papers tab ────────────────────────────────────────────────────────────────

test.describe('Papers Tab — Card Content', () => {
  test.beforeEach(async ({ page }) => {
    await goToResults(page);
    await page.locator('.view-tab').filter({ hasText: 'Papers' }).click();
    await expect(page.locator('.paper-card').first()).toBeVisible({ timeout: 5000 });
  });

  test('first paper card shows correct title', async ({ page }) => {
    const title = page.locator('.paper-card').first().locator('.paper-title');
    await expect(title).toContainText('Attention Is All You Need');
  });

  test('first paper card shows authors', async ({ page }) => {
    const meta = page.locator('.paper-card').first().locator('.paper-meta');
    await expect(meta).toContainText('Ashish Vaswani');
  });

  test('first paper card shows summary text', async ({ page }) => {
    const summary = page.locator('.paper-card').first().locator('.paper-summary');
    await expect(summary).toBeVisible();
    const text = await summary.textContent();
    expect(text.trim().length).toBeGreaterThan(10);
  });

  test('first paper card shows keyword tags', async ({ page }) => {
    const card = page.locator('.paper-card').first();
    const keywords = card.locator('.kw-tag');
    const count = await keywords.count();
    expect(count).toBeGreaterThan(0);
  });

  test('first paper card shows research gaps badge', async ({ page }) => {
    const card = page.locator('.paper-card').first();
    await expect(card.locator('.paper-tags .badge').first()).toBeVisible();
  });

  test('second paper card shows different title', async ({ page }) => {
    const title = page.locator('.paper-card').nth(1).locator('.paper-title');
    await expect(title).toContainText('BERT');
  });

  test('paper card has arXiv link with correct href', async ({ page }) => {
    const link = page.locator('.paper-card').first().locator('.paper-link');
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    expect(href).toContain('arxiv.org');
  });

  test('arXiv link opens in new tab', async ({ page }) => {
    const link = page.locator('.paper-card').first().locator('.paper-link');
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('expand button reveals paper details', async ({ page }) => {
    const card = page.locator('.paper-card').first();
    await card.locator('.expand-btn').click();
    await expect(card.locator('.paper-details')).toBeVisible({ timeout: 3000 });
  });

  test('expanded details show Research Gaps block', async ({ page }) => {
    const card = page.locator('.paper-card').first();
    await card.locator('.expand-btn').click();
    const details = card.locator('.paper-details');
    await expect(details.locator('.detail-block').filter({ hasText: 'Research Gaps' })).toBeVisible();
  });

  test('expanded details show Limitations block', async ({ page }) => {
    const card = page.locator('.paper-card').first();
    await card.locator('.expand-btn').click();
    await expect(card.locator('.paper-details .detail-block').filter({ hasText: 'Limitations' })).toBeVisible();
  });

  test('expanded details show Future Scope block', async ({ page }) => {
    const card = page.locator('.paper-card').first();
    await card.locator('.expand-btn').click();
    await expect(card.locator('.paper-details .detail-block').filter({ hasText: 'Future Scope' })).toBeVisible();
  });

  test('expanded details show Methods block', async ({ page }) => {
    const card = page.locator('.paper-card').first();
    await card.locator('.expand-btn').click();
    await expect(card.locator('.paper-details .detail-block').filter({ hasText: 'Methods' })).toBeVisible();
  });

  test('expanded Research Gaps block contains items', async ({ page }) => {
    const card = page.locator('.paper-card').first();
    await card.locator('.expand-btn').click();
    const gapsBlock = card.locator('.paper-details .detail-block').filter({ hasText: 'Research Gaps' });
    await expect(gapsBlock.locator('.detail-item').first()).toBeVisible();
  });

  test('expanded Methods block shows method pills', async ({ page }) => {
    const card = page.locator('.paper-card').first();
    await card.locator('.expand-btn').click();
    const methodsBlock = card.locator('.paper-details .detail-block').filter({ hasText: 'Methods' });
    await expect(methodsBlock.locator('.method-pill').first()).toBeVisible();
  });

  test('expand button text changes to hide after click', async ({ page }) => {
    const card = page.locator('.paper-card').first();
    await card.locator('.expand-btn').click();
    await expect(card.locator('.expand-btn')).toContainText('Hide');
  });

  test('clicking expand button again hides details', async ({ page }) => {
    const card = page.locator('.paper-card').first();
    await card.locator('.expand-btn').click();
    await expect(card.locator('.paper-details')).toBeVisible();
    await card.locator('.expand-btn').click();
    await expect(card.locator('.paper-details')).toHaveCount(0);
  });

  test('both paper cards have expand buttons', async ({ page }) => {
    const buttons = page.locator('.expand-btn');
    await expect(buttons).toHaveCount(2);
  });
});

// ── Compare tab ───────────────────────────────────────────────────────────────

test.describe('Compare Tab — Table Content', () => {
  test.beforeEach(async ({ page }) => {
    await goToResults(page);
    await page.locator('.view-tab').filter({ hasText: 'Compare' }).click();
    await expect(page.locator('.compare-table')).toBeVisible({ timeout: 5000 });
  });

  test('compare table has Title column header', async ({ page }) => {
    await expect(page.locator('.compare-table thead th').filter({ hasText: 'Title' })).toBeVisible();
  });

  test('compare table has Authors column header', async ({ page }) => {
    await expect(page.locator('.compare-table thead th').filter({ hasText: 'Authors' })).toBeVisible();
  });

  test('compare table has Year column header', async ({ page }) => {
    await expect(page.locator('.compare-table thead th').filter({ hasText: 'Year' })).toBeVisible();
  });

  test('compare table has Research Gaps column header', async ({ page }) => {
    await expect(page.locator('.compare-table thead th').filter({ hasText: 'Research Gaps' })).toBeVisible();
  });

  test('compare table has Limitations column header', async ({ page }) => {
    await expect(page.locator('.compare-table thead th').filter({ hasText: 'Limitations' })).toBeVisible();
  });

  test('compare table has Future Scope column header', async ({ page }) => {
    await expect(page.locator('.compare-table thead th').filter({ hasText: 'Future Scope' })).toBeVisible();
  });

  test('first row title cell shows paper title', async ({ page }) => {
    const firstRow = page.locator('.compare-table tbody tr').first();
    await expect(firstRow.locator('.ct-title')).toContainText('Attention Is All You Need');
  });

  test('first row author cell shows author name', async ({ page }) => {
    const firstRow = page.locator('.compare-table tbody tr').first();
    await expect(firstRow.locator('.ct-author')).toContainText('Vaswani');
  });

  test('first row year cell shows publication year', async ({ page }) => {
    const firstRow = page.locator('.compare-table tbody tr').first();
    await expect(firstRow.locator('.ct-date')).toContainText('2017');
  });

  test('first row keywords cell shows mini-pills', async ({ page }) => {
    const firstRow = page.locator('.compare-table tbody tr').first();
    await expect(firstRow.locator('.mini-pill').first()).toBeVisible();
  });

  test('badges show Yes for papers with research gaps', async ({ page }) => {
    const firstRow = page.locator('.compare-table tbody tr').first();
    await expect(firstRow.locator('.badge.yes')).toBeVisible();
  });

  test('badges show Yes for papers with limitations', async ({ page }) => {
    const firstRow = page.locator('.compare-table tbody tr').first();
    await expect(firstRow.locator('.badge.warn')).toBeVisible();
  });

  test('badges show Yes for papers with future scope', async ({ page }) => {
    const firstRow = page.locator('.compare-table tbody tr').first();
    await expect(firstRow.locator('.badge.sky')).toBeVisible();
  });

  test('compare table has arXiv links', async ({ page }) => {
    const links = page.locator('.compare-table .paper-link');
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
    const href = await links.first().getAttribute('href');
    expect(href).toContain('arxiv.org');
  });

  test('section header shows correct paper count', async ({ page }) => {
    await expect(page.locator('.section-head h3')).toContainText('2 papers');
  });
});
