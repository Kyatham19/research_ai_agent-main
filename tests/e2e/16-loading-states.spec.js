/**
 * 16-loading-states.spec.js
 * Verifies that submit buttons are disabled and show a spinner while a request
 * is in flight — for all four input modes: topic, text, URL, PDF.
 * (Topic loading state is also in 03-topic-search, but the others were missing.)
 */
const { test, expect } = require('@playwright/test');
const { topicResultFixture, textFixture, urlFixture, singlePdfFixture } = require('../fixtures/mock-responses');
const path = require('path');

const PDF_PATH = path.join(__dirname, '..', 'fixtures', 'sample.pdf');
const DELAY    = 600; // ms — long enough to assert loading state before mock resolves

function mockWorkspace(page) {
  return page.route('**/api/workspaces', async route => {
    if (route.request().method() === 'POST')
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'test1234' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

// ── Topic search ──────────────────────────────────────────────────────────────

test.describe('Loading States — Topic Search', () => {
  test('submit button is disabled while searching', async ({ page }) => {
    await mockWorkspace(page);
    await page.route('**/analyze/topic', async route => {
      await new Promise(r => setTimeout(r, DELAY));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(topicResultFixture) });
    });
    await page.goto('/');
    await page.locator('.input-tab').filter({ hasText: 'Topic Search' }).click();
    await page.locator('.input-field').first().fill('neural networks');
    const btn = page.locator('.btn-primary');
    await btn.click();
    await expect(btn).toBeDisabled();
  });

  test('spinner is visible while searching', async ({ page }) => {
    await mockWorkspace(page);
    await page.route('**/analyze/topic', async route => {
      await new Promise(r => setTimeout(r, DELAY));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(topicResultFixture) });
    });
    await page.goto('/');
    await page.locator('.input-tab').filter({ hasText: 'Topic Search' }).click();
    await page.locator('.input-field').first().fill('neural networks');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.spinner')).toBeVisible();
  });

  test('button re-enables after search completes', async ({ page }) => {
    await mockWorkspace(page);
    await page.route('**/analyze/topic', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(topicResultFixture) })
    );
    await page.goto('/');
    await page.locator('.input-tab').filter({ hasText: 'Topic Search' }).click();
    await page.locator('.input-field').first().fill('neural networks');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.results-page')).toBeVisible({ timeout: 10000 });
    await page.locator('.btn-outline').click(); // back to home
    await expect(page.locator('.btn-primary')).toBeEnabled();
  });
});

// ── Text analysis ─────────────────────────────────────────────────────────────

test.describe('Loading States — Text Analysis', () => {
  test('analyze button is disabled while analyzing text', async ({ page }) => {
    await mockWorkspace(page);
    await page.route('**/analyze/text', async route => {
      await new Promise(r => setTimeout(r, DELAY));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(textFixture) });
    });
    await page.goto('/');
    await page.locator('.input-tab').filter({ hasText: 'Paste Text' }).click();
    await page.locator('textarea.input-field').fill('Some text to analyze for research purposes.');
    const btn = page.locator('.btn-primary');
    await btn.click();
    await expect(btn).toBeDisabled();
  });

  test('spinner is visible while analyzing text', async ({ page }) => {
    await mockWorkspace(page);
    await page.route('**/analyze/text', async route => {
      await new Promise(r => setTimeout(r, DELAY));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(textFixture) });
    });
    await page.goto('/');
    await page.locator('.input-tab').filter({ hasText: 'Paste Text' }).click();
    await page.locator('textarea.input-field').fill('Some text to analyze for research purposes.');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.spinner')).toBeVisible();
  });

  test('button shows Analyzing... text while loading', async ({ page }) => {
    await mockWorkspace(page);
    await page.route('**/analyze/text', async route => {
      await new Promise(r => setTimeout(r, DELAY));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(textFixture) });
    });
    await page.goto('/');
    await page.locator('.input-tab').filter({ hasText: 'Paste Text' }).click();
    await page.locator('textarea.input-field').fill('Some text to analyze for research purposes.');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.btn-primary')).toContainText('Analyzing');
  });
});

// ── URL analysis ──────────────────────────────────────────────────────────────

test.describe('Loading States — URL Analysis', () => {
  test('analyze button is disabled while fetching URL', async ({ page }) => {
    await mockWorkspace(page);
    await page.route('**/analyze/url', async route => {
      await new Promise(r => setTimeout(r, DELAY));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(urlFixture) });
    });
    await page.goto('/');
    await page.locator('.input-tab').filter({ hasText: 'URL' }).click();
    await page.locator('.input-field').fill('https://arxiv.org/abs/2005.11401');
    const btn = page.locator('.btn-primary');
    await btn.click();
    await expect(btn).toBeDisabled();
  });

  test('spinner is visible while fetching URL', async ({ page }) => {
    await mockWorkspace(page);
    await page.route('**/analyze/url', async route => {
      await new Promise(r => setTimeout(r, DELAY));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(urlFixture) });
    });
    await page.goto('/');
    await page.locator('.input-tab').filter({ hasText: 'URL' }).click();
    await page.locator('.input-field').fill('https://arxiv.org/abs/2005.11401');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.spinner')).toBeVisible();
  });

  test('button shows Fetching... text while loading', async ({ page }) => {
    await mockWorkspace(page);
    await page.route('**/analyze/url', async route => {
      await new Promise(r => setTimeout(r, DELAY));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(urlFixture) });
    });
    await page.goto('/');
    await page.locator('.input-tab').filter({ hasText: 'URL' }).click();
    await page.locator('.input-field').fill('https://arxiv.org/abs/2005.11401');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.btn-primary')).toContainText('Fetching');
  });
});

// ── PDF upload ────────────────────────────────────────────────────────────────

test.describe('Loading States — PDF Upload', () => {
  test('analyze button is disabled while processing PDF', async ({ page }) => {
    await mockWorkspace(page);
    await page.route('**/analyze/pdf', async route => {
      await new Promise(r => setTimeout(r, DELAY));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(singlePdfFixture) });
    });
    await page.goto('/');
    await page.locator('.input-tab').filter({ hasText: 'PDF Upload' }).click();
    await page.locator('input[type="file"]').setInputFiles(PDF_PATH);
    const btn = page.locator('.btn-primary');
    await btn.click();
    await expect(btn).toBeDisabled();
  });

  test('spinner is visible while processing PDF', async ({ page }) => {
    await mockWorkspace(page);
    await page.route('**/analyze/pdf', async route => {
      await new Promise(r => setTimeout(r, DELAY));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(singlePdfFixture) });
    });
    await page.goto('/');
    await page.locator('.input-tab').filter({ hasText: 'PDF Upload' }).click();
    await page.locator('input[type="file"]').setInputFiles(PDF_PATH);
    await page.locator('.btn-primary').click();
    await expect(page.locator('.spinner')).toBeVisible();
  });

  test('button shows Analyzing... text while loading', async ({ page }) => {
    await mockWorkspace(page);
    await page.route('**/analyze/pdf', async route => {
      await new Promise(r => setTimeout(r, DELAY));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(singlePdfFixture) });
    });
    await page.goto('/');
    await page.locator('.input-tab').filter({ hasText: 'PDF Upload' }).click();
    await page.locator('input[type="file"]').setInputFiles(PDF_PATH);
    await page.locator('.btn-primary').click();
    await expect(page.locator('.btn-primary')).toContainText('Analyzing');
  });
});
