// @ts-check
/**
 * 17-input-edge-cases.spec.js
 * Boundary values, whitespace-only inputs, PDF deduplication, and slider behaviour
 * that are not covered by the basic happy-path specs.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const { topicResultFixture } = require('../fixtures/mock-responses');

const PDF_PATH = path.join(__dirname, '..', 'fixtures', 'sample.pdf');

test.describe('Input Edge Cases — Whitespace Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/workspaces', async route => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ json: { id: 'ws-edge' } });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto('/');
  });

  test('whitespace-only topic shows "Enter a topic." error', async ({ page }) => {
    // trim() makes "   " falsy — same guard as fully empty input
    await page.locator('.input-field').fill('   ');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.error-toast')).toContainText('Enter a topic.');
  });

  test('whitespace-only URL shows "Enter a URL." error', async ({ page }) => {
    await page.locator('.input-tab').filter({ hasText: 'URL' }).click();
    await page.locator('.input-field').fill('   ');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.error-toast')).toContainText('Enter a URL.');
  });

  test('whitespace-only pasted text shows "Paste some text." error', async ({ page }) => {
    await page.locator('.input-tab').filter({ hasText: 'Paste Text' }).click();
    await page.locator('.input-field').fill('   ');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.error-toast')).toContainText('Paste some text.');
  });
});

test.describe('Input Edge Cases — Papers Slider Boundaries', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/workspaces', async route => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ json: { id: 'ws-edge' } });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto('/');
  });

  // React overrides the value setter so a plain `el.value = x` assignment does
  // not fire the synthetic onChange. The native setter must be invoked first.
  function setRangeValue(el, v) {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
      .set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  test('slider forced to minimum (1) displays "1"', async ({ page }) => {
    await page.locator('input[type="range"]').evaluate(setRangeValue, 1);
    await expect(page.locator('.slider-val')).toContainText('1');
  });

  test('slider forced to maximum (10) displays "10"', async ({ page }) => {
    await page.locator('input[type="range"]').evaluate(setRangeValue, 10);
    await expect(page.locator('.slider-val')).toContainText('10');
  });

  test('slider value is sent as max_papers in the API request body', async ({ page }) => {
    let capturedBody = null;
    await page.route('**/analyze/topic', async route => {
      capturedBody = JSON.parse(route.request().postData() || '{}');
      return route.fulfill({ json: { ...topicResultFixture } });
    });

    await page.locator('input[type="range"]').evaluate(setRangeValue, 7);
    await page.locator('.input-field').fill('transformer architectures');
    await page.locator('.btn-primary').click();

    await page.locator('.results-page').waitFor({ timeout: 8000 });
    expect(capturedBody?.max_papers).toBe(7);
  });
});

test.describe('Input Edge Cases — PDF Upload Behaviour', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/workspaces', async route => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ json: { id: 'ws-edge' } });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto('/');
    await page.locator('.input-tab').filter({ hasText: 'PDF Upload' }).click();
  });

  test('uploading the same filename twice shows only one chip (deduplication)', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');

    // First upload
    await fileInput.setInputFiles(PDF_PATH);
    await expect(page.locator('.file-chip')).toHaveCount(1);

    // Second upload with identical filename — deduped by addFiles()
    await fileInput.setInputFiles(PDF_PATH);
    await expect(page.locator('.file-chip')).toHaveCount(1);
  });

  test('PDF analyze button label reflects the current file count', async ({ page }) => {
    // Before any file: "Analyze 0 PDFs" (or just the button disabled state)
    const btn = page.locator('.btn-primary');
    await expect(btn).toContainText('0 PDF');

    await page.locator('input[type="file"]').setInputFiles(PDF_PATH);
    // After 1 file: "Analyze 1 PDF" (singular)
    await expect(btn).toContainText('1 PDF');
  });

  test('removing a file chip decrements the analyze button count', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(PDF_PATH);
    await expect(page.locator('.btn-primary')).toContainText('1 PDF');

    await page.locator('.file-chip button').click();
    await expect(page.locator('.file-chip')).toHaveCount(0);
    await expect(page.locator('.btn-primary')).toContainText('0 PDF');
  });
});
