// @ts-check
/**
 * 19-multi-pdf-results.spec.js
 * Validates that a multi-PDF analysis response (POST /analyze/pdfs) renders
 * the full multi-paper view (Combined / Compare / Papers tabs), distinct from
 * a single-PDF response which renders the single-paper view.
 *
 * 04-pdf-upload verifies the upload flow; this spec focuses on what is SHOWN
 * in ResultsPage after the response arrives.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const { multiPdfFixture, singlePdfFixture } = require('../fixtures/mock-responses');

const PDF_PATH = path.join(__dirname, '..', 'fixtures', 'sample.pdf');

// Helper — navigate to home on PDF tab with workspace and analyze/pdfs mocked
async function setupMultiPdfResults(page) {
  await page.route('**/api/workspaces', async route => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ json: { id: 'ws-pdf' } });
    }
    return route.fulfill({ json: [] });
  });
  await page.route('**/analyze/pdfs', route =>
    route.fulfill({ json: multiPdfFixture })
  );
  await page.route('**/analyze/pdf', route =>
    route.fulfill({ json: singlePdfFixture })
  );

  await page.goto('/');
  await page.locator('.input-tab').filter({ hasText: 'PDF Upload' }).click();
}

test.describe('Multi-PDF Results — View Tabs', () => {
  test.beforeEach(async ({ page }) => {
    await setupMultiPdfResults(page);

    // Use two virtual PDF files so /analyze/pdfs is invoked (not /analyze/pdf)
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      { name: 'doc1.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') },
      { name: 'doc2.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') },
    ]);
    // Confirm both chips appeared before submitting
    await expect(page.locator('.file-chip')).toHaveCount(2);
    await page.locator('.btn-primary').click();
    await page.locator('.results-page').waitFor({ timeout: 10000 });
  });

  test('multi-PDF results show Combined, Compare, and Papers tabs', async ({ page }) => {
    await expect(page.locator('.view-tab')).toHaveCount(3);
  });

  test('Combined tab is active by default', async ({ page }) => {
    await expect(page.locator('.view-tab.active')).toContainText('Combined');
  });

  test('Papers tab shows the correct number of paper cards', async ({ page }) => {
    await page.locator('.view-tab').filter({ hasText: 'Papers' }).click();
    await expect(page.locator('.paper-card')).toHaveCount(multiPdfFixture.papers.length);
  });

  test('Papers tab shows doc1.pdf as first paper title', async ({ page }) => {
    await page.locator('.view-tab').filter({ hasText: 'Papers' }).click();
    await expect(page.locator('.paper-card').first().locator('.paper-title')).toContainText('doc1.pdf');
  });

  test('Papers tab shows doc2.pdf as second paper title', async ({ page }) => {
    await page.locator('.view-tab').filter({ hasText: 'Papers' }).click();
    await expect(page.locator('.paper-card').nth(1).locator('.paper-title')).toContainText('doc2.pdf');
  });

  test('Combined tab shows the combined analysis summary', async ({ page }) => {
    // Combined tab is already active — SingleAnalysis renders with combined data
    await expect(page.locator('.summary-text')).toContainText(multiPdfFixture.combined.summary);
  });

  test('toolbar label shows Multi-PDF mode', async ({ page }) => {
    await expect(page.locator('.results-label')).toContainText('Multi-PDF');
  });
});

test.describe('Single PDF Results — No View Tabs', () => {
  test('single PDF analysis renders single-paper view (no view tabs)', async ({ page }) => {
    await setupMultiPdfResults(page);

    // Upload exactly one PDF → calls /analyze/pdf → single-paper response
    await page.locator('input[type="file"]').setInputFiles(PDF_PATH);
    await page.locator('.btn-primary').click();
    await page.locator('.results-page').waitFor({ timeout: 10000 });

    // Single-paper mode: VIEWS array is empty, no .view-tab elements rendered
    await expect(page.locator('.view-tab')).toHaveCount(0);
  });
});
