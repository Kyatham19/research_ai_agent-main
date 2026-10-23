// @ts-check
/**
 * 18-workspace-ui-flow.spec.js
 * Covers the UI-level workspace lifecycle: selecting from the sidebar loads
 * results, active highlighting, and deleting the active workspace navigates
 * back to home.
 *
 * 08-workspace-crud only tests the API; this spec tests the React interaction.
 */
const { test, expect } = require('@playwright/test');
const {
  workspaceFixture,
  favoritedWorkspaceFixture,
  fullWorkspaceFixture,
  topicResultFixture,
} = require('../fixtures/mock-responses');

// fullWorkspaceFixture extended with a combined analysis (as stored post-refactor)
const fullWorkspaceWithCombined = {
  ...fullWorkspaceFixture,
  combined: {
    title: 'Combined: Retrieval-Augmented Generation',
    summary: 'Combined analysis of retrieved papers.',
    research_gaps_flat: ['Gap A', 'Gap B'],
    future_scope_flat: ['Future A'],
    contributions: ['Contrib A'],
    methods: ['Method A'],
    keywords: [{ term: 'RAG', score: 90 }],
    limitations: ['Limit A'],
    important_sentences: [],
    stats: { word_count: 14400, sentence_count: 640, avg_sentence_length: 22, unique_words: 3800 },
  },
};

test.describe('Workspace UI — Sidebar → Results Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Sidebar loads workspace list on mount
    await page.route('**/api/workspaces', async route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: [workspaceFixture, favoritedWorkspaceFixture] });
      }
      return route.fulfill({ json: { id: 'ws-new' } });
    });

    // Full workspace payload returned when sidebar item is clicked
    await page.route(`**/api/workspaces/${workspaceFixture.id}`, route =>
      route.fulfill({ json: fullWorkspaceWithCombined })
    );
    await page.route(`**/api/workspaces/${favoritedWorkspaceFixture.id}`, route =>
      route.fulfill({ json: { ...fullWorkspaceWithCombined, metadata: { ...fullWorkspaceWithCombined.metadata, id: favoritedWorkspaceFixture.id } } })
    );

    await page.goto('/');
  });

  test('clicking a workspace item in the sidebar transitions to results view', async ({ page }) => {
    await page.locator('.ws-item').first().click();
    await expect(page.locator('.results-page')).toBeVisible({ timeout: 8000 });
  });

  test('clicked workspace is marked active in the sidebar', async ({ page }) => {
    const item = page.locator('.ws-item').first();
    await item.click();
    await page.locator('.results-page').waitFor({ timeout: 8000 });
    await expect(item).toHaveClass(/ws-item--active/);
  });

  test('loaded topic workspace shows the correct topic in the results toolbar', async ({ page }) => {
    await page.locator('.ws-item').first().click();
    await page.locator('.results-page').waitFor({ timeout: 8000 });
    await expect(page.locator('.results-title')).toContainText(workspaceFixture.query);
  });

  test('topic-mode workspace shows Combined / Compare / Papers view tabs', async ({ page }) => {
    await page.locator('.ws-item').first().click();
    await page.locator('.results-page').waitFor({ timeout: 8000 });
    await expect(page.locator('.view-tab')).toHaveCount(3);
    await expect(page.locator('.view-tab').nth(0)).toContainText('Combined');
    await expect(page.locator('.view-tab').nth(1)).toContainText('Compare');
    await expect(page.locator('.view-tab').nth(2)).toContainText('Papers');
  });

  test('workspace with paper_count shows correct count badge in sidebar', async ({ page }) => {
    // Favorites render above Recent, so .first() is the favorited workspace (3 papers).
    // Target by query text to get the specific workspace being asserted.
    await expect(page.locator('.ws-item').first()).toBeVisible();
    const item = page.locator('.ws-item').filter({ hasText: workspaceFixture.query });
    await expect(item.locator('.ws-meta')).toContainText(`${workspaceFixture.paper_count} papers`);
  });

  test('"Favorites" section is present when a favorited workspace exists', async ({ page }) => {
    await expect(page.locator('.sidebar-section').first()).toContainText('Favorites');
    await expect(page.locator('.sidebar-section').first()).toContainText(favoritedWorkspaceFixture.query);
  });
});

test.describe('Workspace UI — Delete Active Workspace', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/workspaces', async route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: [workspaceFixture] });
      }
      return route.fulfill({ json: { id: 'ws-new' } });
    });
    await page.route(`**/api/workspaces/${workspaceFixture.id}`, async route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: fullWorkspaceWithCombined });
      }
      if (route.request().method() === 'DELETE') {
        // After delete the sidebar re-fetches; return empty list
        await page.route('**/api/workspaces', route =>
          route.fulfill({ json: [] })
        );
        return route.fulfill({ json: { deleted: true } });
      }
    });

    await page.goto('/');
    // Open the workspace so it becomes the active one
    await page.locator('.ws-item').click();
    await page.locator('.results-page').waitFor({ timeout: 8000 });
  });

  test('deleting the currently-active workspace returns to home view', async ({ page }) => {
    page.once('dialog', d => d.accept()); // confirm("Delete this workspace?")
    await page.locator('.ws-action-btn--delete').click();
    await expect(page.locator('.home')).toBeVisible({ timeout: 6000 });
  });

  test('deleting active workspace removes it from the sidebar', async ({ page }) => {
    page.once('dialog', d => d.accept());
    await page.locator('.ws-action-btn--delete').click();
    await expect(page.locator('.ws-item')).toHaveCount(0, { timeout: 6000 });
  });
});

test.describe('Workspace UI — 404 Load Error', () => {
  test('loading a workspace that returns 404 shows an error message', async ({ page }) => {
    await page.route('**/api/workspaces', route =>
      route.fulfill({ json: [workspaceFixture] })
    );
    await page.route(`**/api/workspaces/${workspaceFixture.id}`, route =>
      route.fulfill({ status: 404, json: { error: 'Not found' } })
    );

    await page.goto('/');
    await page.locator('.ws-item').click();

    // App.jsx catches the error and calls setError(), which renders the toast
    await expect(page.locator('.error-toast')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('.error-toast')).toContainText('Not found');
  });
});
