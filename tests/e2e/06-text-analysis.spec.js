const { test, expect } = require('@playwright/test');
const { textFixture } = require('../fixtures/mock-responses');

const SAMPLE_TEXT = `Retrieval-Augmented Generation (RAG) is a technique that combines retrieval from external knowledge
bases with the generative capabilities of large language models. By retrieving relevant documents at
inference time, RAG systems can access up-to-date information beyond the model's training cutoff.
This approach significantly reduces hallucinations and improves factual accuracy across a wide range
of knowledge-intensive tasks including open-domain question answering, fact verification, and
dialogue systems that require current world knowledge.`;

test.describe('Text Analysis', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/workspaces', async route => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'test1234' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('**/analyze/text', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(textFixture) })
    );
    await page.goto('/');
    await page.locator('.input-tab').filter({ hasText: 'Paste Text' }).click();
  });

  test('Paste Text tab shows textarea', async ({ page }) => {
    await expect(page.locator('.input-tab.active')).toContainText('Paste Text');
    await expect(page.locator('textarea.input-field')).toBeVisible();
  });

  test('submitting empty textarea shows error', async ({ page }) => {
    await page.locator('.btn-primary').click();
    await expect(page.locator('.error-toast')).toContainText('Paste some text');
  });

  test('submitting text transitions to results', async ({ page }) => {
    await page.locator('textarea.input-field').fill(SAMPLE_TEXT);
    await page.locator('.btn-primary').click();
    await expect(page.locator('.results-page')).toBeVisible({ timeout: 10000 });
  });

  test('Enter key inside textarea does NOT submit (allows newlines)', async ({ page }) => {
    await page.locator('textarea.input-field').fill('First line');
    await page.locator('textarea.input-field').press('Enter');
    // Page should still be on home, not results
    await expect(page.locator('.home')).toBeVisible();
    await expect(page.locator('.results-page')).toHaveCount(0);
  });

  test('results title is visible after text analysis', async ({ page }) => {
    await page.locator('textarea.input-field').fill(SAMPLE_TEXT);
    await page.locator('.btn-primary').click();
    await expect(page.locator('.results-title')).toBeVisible({ timeout: 10000 });
  });
});
