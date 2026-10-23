// @ts-check
/**
 * 21-network-errors.spec.js
 * Validates frontend behaviour when the network fails (fetch throws) or the
 * backend returns unexpected HTTP error codes.
 *
 * 12-error-states covers 500 server errors and empty sidebar states.
 * This spec covers:
 *  - Network-level failures (abort) → "Cannot connect to backend." toast
 *  - Backend 400 errors with specific messages shown in the toast
 *  - Topic search returning 404 "No papers found" propagated as toast
 *  - Workspace load 404 caught and shown as toast
 *  - Chat API: POST message and empty-message 400 (API-level, no mocking needed)
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const { workspaceFixture } = require('../fixtures/mock-responses');

const PDF_PATH = path.join(__dirname, '..', 'fixtures', 'sample.pdf');

// ─── Network failures (route.abort() simulates offline / refused connection) ──

test.describe('Network Failures → "Cannot connect to backend." toast', () => {
  test.beforeEach(async ({ page }) => {
    // Workspace creation is allowed to fail silently; it's non-critical
    await page.route('**/api/workspaces', route => route.fulfill({ json: [] }));
  });

  test('topic search with no server shows "Cannot connect to backend." toast', async ({ page }) => {
    await page.route('**/api/workspaces', async route => {
      if (route.request().method() === 'POST') return route.abort();
      return route.fulfill({ json: [] });
    });
    await page.route('**/analyze/topic', route => route.abort());
    await page.goto('/');
    await page.locator('.input-field').fill('quantum computing');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.error-toast')).toContainText('Cannot connect to backend', { timeout: 8000 });
  });

  test('text analysis with no server shows "Cannot connect to backend." toast', async ({ page }) => {
    await page.route('**/api/workspaces', async route => {
      if (route.request().method() === 'POST') return route.abort();
      return route.fulfill({ json: [] });
    });
    await page.route('**/analyze/text', route => route.abort());
    await page.goto('/');
    await page.locator('.input-tab').filter({ hasText: 'Paste Text' }).click();
    await page.locator('.input-field').fill('A long enough string to pass validation.');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.error-toast')).toContainText('Cannot connect to backend', { timeout: 8000 });
  });

  test('URL analysis with no server shows "Cannot connect to backend." toast', async ({ page }) => {
    await page.route('**/api/workspaces', async route => {
      if (route.request().method() === 'POST') return route.abort();
      return route.fulfill({ json: [] });
    });
    await page.route('**/analyze/url', route => route.abort());
    await page.goto('/');
    await page.locator('.input-tab').filter({ hasText: 'URL' }).click();
    await page.locator('.input-field').fill('https://arxiv.org/abs/2310.01848');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.error-toast')).toContainText('Cannot connect to backend', { timeout: 8000 });
  });

  test('PDF upload with no server shows "Cannot connect to backend." toast', async ({ page }) => {
    await page.route('**/api/workspaces', async route => {
      if (route.request().method() === 'POST') return route.abort();
      return route.fulfill({ json: [] });
    });
    await page.route('**/analyze/pdf', route => route.abort());
    await page.goto('/');
    await page.locator('.input-tab').filter({ hasText: 'PDF Upload' }).click();
    await page.locator('input[type="file"]').setInputFiles(PDF_PATH);
    await page.locator('.btn-primary').click();
    await expect(page.locator('.error-toast')).toContainText('Cannot connect to backend', { timeout: 8000 });
  });
});

// ─── Backend 4xx errors with specific error messages ────────────────────────

test.describe('Backend Error Messages → toast shows data.error text', () => {
  test('backend 400 "Could not extract text" from PDF shown in toast', async ({ page }) => {
    await page.route('**/api/workspaces', async route => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ json: { id: 'ws-err' } });
      }
      return route.fulfill({ json: [] });
    });
    await page.route('**/analyze/pdf', route =>
      route.fulfill({ status: 400, json: { error: 'Could not extract text' } })
    );

    await page.goto('/');
    await page.locator('.input-tab').filter({ hasText: 'PDF Upload' }).click();
    await page.locator('input[type="file"]').setInputFiles(PDF_PATH);
    await page.locator('.btn-primary').click();
    await expect(page.locator('.error-toast')).toContainText('Could not extract text', { timeout: 8000 });
  });

  test('topic search 404 "No papers found for this topic" shown in toast', async ({ page }) => {
    await page.route('**/api/workspaces', async route => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ json: { id: 'ws-err' } });
      }
      return route.fulfill({ json: [] });
    });
    await page.route('**/analyze/topic', route =>
      route.fulfill({ status: 404, json: { error: 'No papers found for this topic' } })
    );

    await page.goto('/');
    await page.locator('.input-field').fill('xyzzy123nonexistentquery');
    await page.locator('.btn-primary').click();
    await expect(page.locator('.error-toast')).toContainText('No papers found', { timeout: 8000 });
  });
});

// ─── Chat API — API-level (uses request context, real backend required) ─────

test.describe('Chat API — POST /api/workspaces/:id/chat', () => {
  // These hit the real backend; they do NOT require Gemini — only Flask storage.
  let workspaceId;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/workspaces', {
      data: { query: 'Chat API test workspace' },
    });
    const ws = await res.json();
    workspaceId = ws.id;
  });

  test.afterAll(async ({ request }) => {
    if (workspaceId) {
      await request.delete(`/api/workspaces/${workspaceId}`);
    }
  });

  test('POST valid chat message returns 201 with the message object', async ({ request }) => {
    const res = await request.post(`/api/workspaces/${workspaceId}/chat`, {
      data: { role: 'user', content: 'What are the key contributions?' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.content).toBe('What are the key contributions?');
    expect(body.role).toBe('user');
  });

  test('POST empty message content returns 400', async ({ request }) => {
    const res = await request.post(`/api/workspaces/${workspaceId}/chat`, {
      data: { role: 'user', content: '' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('posted message appears in workspace chat history', async ({ request }) => {
    await request.post(`/api/workspaces/${workspaceId}/chat`, {
      data: { role: 'assistant', content: 'The key contribution is the Transformer.' },
    });
    const ws = await request.get(`/api/workspaces/${workspaceId}`);
    const data = await ws.json();
    const last = data.chat[data.chat.length - 1];
    expect(last.content).toBe('The key contribution is the Transformer.');
    expect(last.role).toBe('assistant');
  });
});
