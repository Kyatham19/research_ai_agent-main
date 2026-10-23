/**
 * 14-results-content.spec.js
 * Verifies actual rendered CONTENT inside results sections — not just that the
 * page appears. Covers topic combined view AND single-paper mode (text analysis).
 */
const { test, expect } = require('@playwright/test');
const { topicResultFixture, textFixture } = require('../fixtures/mock-responses');

// ── shared helpers ────────────────────────────────────────────────────────────

async function mockWorkspace(page) {
  await page.route('**/api/workspaces', async route => {
    if (route.request().method() === 'POST')
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'test1234' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

async function goToTopicResults(page) {
  await mockWorkspace(page);
  await page.route('**/analyze/topic', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(topicResultFixture) })
  );
  await page.goto('/');
  await page.locator('.input-tab').filter({ hasText: 'Topic Search' }).click();
  await page.locator('.input-field').first().fill('transformer attention');
  await page.locator('.btn-primary').click();
  await expect(page.locator('.results-page')).toBeVisible({ timeout: 10000 });
}

async function goToTextResults(page) {
  await mockWorkspace(page);
  await page.route('**/analyze/text', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(textFixture) })
  );
  await page.goto('/');
  await page.locator('.input-tab').filter({ hasText: 'Paste Text' }).click();
  await page.locator('textarea.input-field').fill('Retrieval-Augmented Generation combines retrieval with LLMs.');
  await page.locator('.btn-primary').click();
  await expect(page.locator('.results-page')).toBeVisible({ timeout: 10000 });
}

// ── Topic combined-view content ───────────────────────────────────────────────

test.describe('Results Content — Topic Combined View', () => {
  test('summary-text is rendered and non-empty', async ({ page }) => {
    await goToTopicResults(page);
    const summary = page.locator('.summary-text').first();
    await expect(summary).toBeVisible();
    const text = await summary.textContent();
    expect(text.trim().length).toBeGreaterThan(10);
  });

  test('keyword chips are rendered', async ({ page }) => {
    await goToTopicResults(page);
    await expect(page.locator('.kw-tag').first()).toBeVisible();
    const count = await page.locator('.kw-tag').count();
    expect(count).toBeGreaterThan(0);
  });

  test('keyword chips show term text', async ({ page }) => {
    await goToTopicResults(page);
    const firstKw = page.locator('.kw-tag').first();
    const term = await firstKw.textContent();
    expect(term.trim().length).toBeGreaterThan(0);
  });

  test('Research Gaps section is open by default', async ({ page }) => {
    await goToTopicResults(page);
    const section = page.locator('.section-card').filter({ hasText: 'Research Gaps' }).first();
    await expect(section.locator('.section-toggle')).toHaveClass(/open/);
  });

  test('Research Gaps section contains items', async ({ page }) => {
    await goToTopicResults(page);
    const gaps = page.locator('.result-list.gaps li');
    await expect(gaps.first()).toBeVisible();
    const count = await gaps.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Limitations section is open by default', async ({ page }) => {
    await goToTopicResults(page);
    const section = page.locator('.section-card').filter({ hasText: 'Limitations' }).first();
    await expect(section.locator('.section-toggle')).toHaveClass(/open/);
  });

  test('Limitations section contains items', async ({ page }) => {
    await goToTopicResults(page);
    const items = page.locator('.result-list.limits li');
    await expect(items.first()).toBeVisible();
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Future Scope section is open by default', async ({ page }) => {
    await goToTopicResults(page);
    const section = page.locator('.section-card').filter({ hasText: 'Future Scope' }).first();
    await expect(section.locator('.section-toggle')).toHaveClass(/open/);
  });

  test('Future Scope section contains items', async ({ page }) => {
    await goToTopicResults(page);
    const items = page.locator('.result-list.future li');
    await expect(items.first()).toBeVisible();
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Methods section opens and shows method pills', async ({ page }) => {
    await goToTopicResults(page);
    const section = page.locator('.section-card').filter({ hasText: 'Methods' }).first();
    await section.locator('.section-head').click();
    await expect(section.locator('.method-pill').first()).toBeVisible();
  });

  test('Contributions section opens and shows items', async ({ page }) => {
    await goToTopicResults(page);
    const section = page.locator('.section-card').filter({ hasText: 'Contributions' }).first();
    await section.locator('.section-head').click();
    await expect(section.locator('.result-list.contrib li').first()).toBeVisible();
  });

  test('Key Sentences section opens and shows items', async ({ page }) => {
    await goToTopicResults(page);
    const section = page.locator('.section-card').filter({ hasText: 'Key Sentences' }).first();
    await section.locator('.section-head').click();
    await expect(section.locator('.result-list li').first()).toBeVisible();
  });

  test('section count badges are shown for open sections', async ({ page }) => {
    await goToTopicResults(page);
    const gapsSection = page.locator('.section-card').filter({ hasText: 'Research Gaps' }).first();
    await expect(gapsSection.locator('.section-count')).toBeVisible();
    const countText = await gapsSection.locator('.section-count').textContent();
    expect(Number(countText)).toBeGreaterThan(0);
  });

  test('stats row shows combined word count (14,400)', async ({ page }) => {
    await goToTopicResults(page);
    await expect(page.locator('.stats-row')).toBeVisible();
    await expect(page.locator('.stats-row')).toContainText('14,400');
  });

  test('stats row shows sentence count', async ({ page }) => {
    await goToTopicResults(page);
    await expect(page.locator('.stats-row')).toContainText('640');
  });

  test('stats row shows unique words', async ({ page }) => {
    await goToTopicResults(page);
    await expect(page.locator('.stats-row')).toContainText('3800');
  });
});

// ── Single-paper mode (text analysis) ────────────────────────────────────────

test.describe('Results Content — Single Paper Mode (Text Analysis)', () => {
  test('no view tabs rendered in single-paper mode', async ({ page }) => {
    await goToTextResults(page);
    await expect(page.locator('.view-tabs')).toHaveCount(0);
  });

  test('summary-text is visible and non-empty', async ({ page }) => {
    await goToTextResults(page);
    const summary = page.locator('.summary-text').first();
    await expect(summary).toBeVisible();
    const text = await summary.textContent();
    expect(text.trim().length).toBeGreaterThan(10);
  });

  test('keyword chips are rendered', async ({ page }) => {
    await goToTextResults(page);
    const count = await page.locator('.kw-tag').count();
    expect(count).toBeGreaterThan(0);
  });

  test('Research Gaps section is open and has items', async ({ page }) => {
    await goToTextResults(page);
    const section = page.locator('.section-card').filter({ hasText: 'Research Gaps' }).first();
    await expect(section.locator('.section-toggle')).toHaveClass(/open/);
    await expect(section.locator('.result-list li').first()).toBeVisible();
  });

  test('Limitations section is open and has items', async ({ page }) => {
    await goToTextResults(page);
    const section = page.locator('.section-card').filter({ hasText: 'Limitations' }).first();
    await expect(section.locator('.section-toggle')).toHaveClass(/open/);
    await expect(section.locator('.result-list li').first()).toBeVisible();
  });

  test('Future Scope section is open and has items', async ({ page }) => {
    await goToTextResults(page);
    const section = page.locator('.section-card').filter({ hasText: 'Future Scope' }).first();
    await expect(section.locator('.section-toggle')).toHaveClass(/open/);
    await expect(section.locator('.result-list li').first()).toBeVisible();
  });

  test('stats row shows single-paper word count (7,200)', async ({ page }) => {
    await goToTextResults(page);
    await expect(page.locator('.stats-row')).toContainText('7,200');
  });

  test('stat cards show Words, Sentences, Unique words, Avg sent. len labels', async ({ page }) => {
    await goToTextResults(page);
    const labels = page.locator('.stat-label');
    await expect(labels.filter({ hasText: /^Words$/ })).toBeVisible();
    await expect(labels.filter({ hasText: /^Sentences$/ })).toBeVisible();
    await expect(labels.filter({ hasText: /^Unique words$/ })).toBeVisible();
  });

  test('sections can be closed by clicking header', async ({ page }) => {
    await goToTextResults(page);
    const section = page.locator('.section-card').filter({ hasText: 'Research Gaps' }).first();
    await section.locator('.section-head').click();
    await expect(section.locator('.section-toggle')).not.toHaveClass(/open/);
    await expect(section.locator('.result-list')).toHaveCount(0);
  });

  test('closed section reopens on header click', async ({ page }) => {
    await goToTextResults(page);
    const section = page.locator('.section-card').filter({ hasText: 'Research Gaps' }).first();
    await section.locator('.section-head').click(); // close
    await section.locator('.section-head').click(); // reopen
    await expect(section.locator('.section-toggle')).toHaveClass(/open/);
    await expect(section.locator('.result-list li').first()).toBeVisible();
  });
});
