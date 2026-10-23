// @ts-check
/**
 * 20-literature-review-builder.spec.js
 * Deep coverage of the Literature Review 3-phase builder:
 *  - Phase 1: empty-state, workspace selection text, no-papers error
 *  - Phase 2: Add (+) button, Remove (✕) button, counter, generate label,
 *             disabled states, topic input, pool-empty state, backend error
 *  - Phase 3: tabs, summary table, contenteditable editing, reset
 *
 * 10-literature-review covers the happy-path "generate → tabs visible" flow.
 * This spec goes deeper into every interactive element.
 */
const { test, expect } = require('@playwright/test');
const { workspaceFixture, fullWorkspaceFixture, reviewFixture } = require('../fixtures/mock-responses');

// Extended review fixture with all fields expected by ReviewDisplay
const fullReviewFixture = {
  ...reviewFixture,
  paper_count: 2,
  topic: 'Transformer Architectures',
  themes: ['Attention', 'Pre-training', 'Transfer Learning'],
  research_trajectory: '## Research Trajectory\n\nThe field has evolved from RNNs toward attention-only architectures.',
  summary_table: [
    {
      title: 'Attention Is All You Need',
      authors: 'Vaswani et al.',
      year: '2017',
      url: 'https://arxiv.org/abs/1706.03762',
      contribution: 'Transformer architecture',
      methodology: 'Multi-head self-attention',
      findings: 'SOTA translation BLEU',
    },
    {
      title: 'BERT',
      authors: 'Devlin et al.',
      year: '2018',
      url: 'https://arxiv.org/abs/1810.04805',
      contribution: 'Bidirectional pre-training',
      methodology: 'Masked language modeling',
      findings: 'SOTA on 11 NLP benchmarks',
    },
  ],
};

// Workspace with papers for Phase 1 → 2 transition
const workspaceWithPapers = {
  ...fullWorkspaceFixture,
  papers: fullWorkspaceFixture.papers, // [paperBase, paper2]
};

// Helper: navigate to Literature Review and complete Phase 1
async function navigateToPhase2(page) {
  await page.route('**/api/workspaces', route =>
    route.fulfill({ json: [workspaceFixture] })
  );
  await page.route(`**/api/workspaces/${workspaceFixture.id}`, route =>
    route.fulfill({ json: workspaceWithPapers })
  );

  await page.goto('/');
  await page.locator('.sidebar-nav-item').filter({ hasText: 'Literature' }).click();
  await expect(page.locator('.lr2-wrap')).toBeVisible();

  // Phase 1: load workspaces
  await page.getByRole('button', { name: /Load My Searches/ }).click();
  await page.locator('.lr2-ws-list').waitFor();

  // Select the workspace
  await page.locator('.lr2-ws-item').first().click();
  await expect(page.locator('.lr2-ws-item').first()).toHaveClass(/lr2-ws-item--active/);

  // Load papers → Phase 2
  await page.getByRole('button', { name: /Load Papers/ }).click();
  await page.locator('.lr2-phase--builder').waitFor();
}

// Helper: navigate to Phase 3 (generates the review)
async function navigateToPhase3(page) {
  await page.route('**/api/literature-review', route =>
    route.fulfill({ json: fullReviewFixture })
  );
  await navigateToPhase2(page);

  // Add both papers to builder
  const addBtns = page.locator('.lr2-add-btn');
  await addBtns.nth(0).click();
  await addBtns.nth(0).click(); // after first add, second paper shifts to index 0

  await page.getByRole('button', { name: /Generate Review/ }).click();
  await page.locator('.lr2-review').waitFor({ timeout: 10000 });
}

// ─── Phase 1 ────────────────────────────────────────────────────────────────

test.describe('Literature Review — Phase 1: Workspace Picker', () => {
  test('empty workspace list shows "No previous searches found" message', async ({ page }) => {
    await page.route('**/api/workspaces', route =>
      route.fulfill({ json: [] })
    );
    await page.goto('/');
    await page.locator('.sidebar-nav-item').filter({ hasText: 'Literature' }).click();
    await page.getByRole('button', { name: /Load My Searches/ }).click();
    await expect(page.locator('.lr2-empty')).toContainText('No previous searches found');
  });

  test('selecting 1 workspace changes Load Papers button text', async ({ page }) => {
    await page.route('**/api/workspaces', route =>
      route.fulfill({ json: [workspaceFixture] })
    );
    await page.goto('/');
    await page.locator('.sidebar-nav-item').filter({ hasText: 'Literature' }).click();
    await page.getByRole('button', { name: /Load My Searches/ }).click();
    await page.locator('.lr2-ws-item').click();
    await expect(page.getByRole('button', { name: /Load Papers from 1 Search/ })).toBeVisible();
  });

  test('selecting 2 workspaces shows plural "Load Papers from 2 Searches"', async ({ page }) => {
    const ws2 = { ...workspaceFixture, id: 'ws-b', query: 'BERT Models' };
    await page.route('**/api/workspaces', route =>
      route.fulfill({ json: [workspaceFixture, ws2] })
    );
    await page.goto('/');
    await page.locator('.sidebar-nav-item').filter({ hasText: 'Literature' }).click();
    await page.getByRole('button', { name: /Load My Searches/ }).click();
    await page.locator('.lr2-ws-item').nth(0).click();
    await page.locator('.lr2-ws-item').nth(1).click();
    await expect(page.getByRole('button', { name: /Load Papers from 2 Searches/ })).toBeVisible();
  });

  test('selected workspace with no papers shows error in Phase 1', async ({ page }) => {
    await page.route('**/api/workspaces', route =>
      route.fulfill({ json: [workspaceFixture] })
    );
    // Return workspace with empty papers array
    await page.route(`**/api/workspaces/${workspaceFixture.id}`, route =>
      route.fulfill({ json: { ...workspaceWithPapers, papers: [] } })
    );

    await page.goto('/');
    await page.locator('.sidebar-nav-item').filter({ hasText: 'Literature' }).click();
    await page.getByRole('button', { name: /Load My Searches/ }).click();
    await page.locator('.lr2-ws-item').click();
    await page.getByRole('button', { name: /Load Papers/ }).click();

    await expect(page.locator('.lr2-error')).toContainText('No papers found');
  });
});

// ─── Phase 2 ────────────────────────────────────────────────────────────────

test.describe('Literature Review — Phase 2: Builder Interactions', () => {
  test('"→" button adds a paper to the builder and removes it from the pool', async ({ page }) => {
    await navigateToPhase2(page);

    const poolCount = await page.locator('.lr2-pool-row').count();
    await page.locator('.lr2-add-btn').first().click();

    // Pool should have one fewer item; builder should have one item
    await expect(page.locator('.lr2-pool-row')).toHaveCount(poolCount - 1);
    await expect(page.locator('.lr2-card--builder')).toHaveCount(1);
  });

  test('"✕" remove button moves a paper back from builder to pool', async ({ page }) => {
    await navigateToPhase2(page);

    // Add one paper
    await page.locator('.lr2-add-btn').first().click();
    await expect(page.locator('.lr2-card--builder')).toHaveCount(1);

    // Remove it
    await page.locator('.lr2-card__remove').click();
    await expect(page.locator('.lr2-card--builder')).toHaveCount(0);
    // Pool is back to full count (2 papers)
    await expect(page.locator('.lr2-pool-row')).toHaveCount(2);
  });

  test('builder counter shows "N / 10" after adding papers', async ({ page }) => {
    await navigateToPhase2(page);

    await page.locator('.lr2-add-btn').first().click();
    const counter = page.locator('.lr2-col--builder .lr2-col__count');
    await expect(counter).toHaveText('1 / 10');
  });

  test('Generate button shows correct paper count in its label', async ({ page }) => {
    await navigateToPhase2(page);

    await page.locator('.lr2-add-btn').nth(0).click();
    await page.locator('.lr2-add-btn').nth(0).click();

    await expect(page.getByRole('button', { name: /Generate Review \(2 papers\)/ })).toBeVisible();
  });

  test('Generate button disabled with 0 papers in builder', async ({ page }) => {
    await navigateToPhase2(page);
    await expect(page.getByRole('button', { name: /Generate Review/ })).toBeDisabled();
  });

  test('Generate button disabled with only 1 paper in builder', async ({ page }) => {
    await navigateToPhase2(page);
    await page.locator('.lr2-add-btn').first().click();
    await expect(page.getByRole('button', { name: /Generate Review/ })).toBeDisabled();
    // Hint text appears when 1 paper is in builder
    await expect(page.locator('.lr2-hint-text')).toContainText('Add at least 2 papers');
  });

  test('"All papers are in the builder." message shows when pool is empty', async ({ page }) => {
    await navigateToPhase2(page);

    // Add all papers to builder (2 total)
    await page.locator('.lr2-add-btn').nth(0).click();
    await page.locator('.lr2-add-btn').nth(0).click();

    await expect(page.locator('.lr2-empty--sm')).toContainText('All papers are in the builder');
  });

  test('topic input in Phase 2 accepts and displays text', async ({ page }) => {
    await navigateToPhase2(page);
    await page.locator('.lr2-input').fill('Transformer architectures in NLP');
    await expect(page.locator('.lr2-input')).toHaveValue('Transformer architectures in NLP');
  });

  test('backend error from /api/literature-review is displayed in the builder', async ({ page }) => {
    await page.route('**/api/literature-review', route =>
      route.fulfill({ status: 400, json: { error: 'At least 2 papers required' } })
    );
    await navigateToPhase2(page);

    // Add 2 papers and attempt generation
    await page.locator('.lr2-add-btn').nth(0).click();
    await page.locator('.lr2-add-btn').nth(0).click();
    await page.getByRole('button', { name: /Generate Review/ }).click();

    await expect(page.locator('.lr2-error')).toContainText('At least 2 papers required', { timeout: 8000 });
  });
});

// ─── Phase 3 ────────────────────────────────────────────────────────────────

test.describe('Literature Review — Phase 3: Review Display', () => {
  test('Summary Table tab renders the table with correct column headers', async ({ page }) => {
    await navigateToPhase3(page);
    await page.locator('.lr-tab').filter({ hasText: '3. Summary Table' }).click();
    const headers = page.locator('.lr-summary-table thead th');
    await expect(headers).toHaveCount(5);
    await expect(headers.nth(0)).toContainText('Paper Title');
    await expect(headers.nth(2)).toContainText('Key Contribution');
  });

  test('Summary Table rows show paper titles from fixture', async ({ page }) => {
    await navigateToPhase3(page);
    await page.locator('.lr-tab').filter({ hasText: '3. Summary Table' }).click();
    const rows = page.locator('.lr-summary-table tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Attention Is All You Need');
  });

  test('contenteditable section is editable in Phase 3', async ({ page }) => {
    await navigateToPhase3(page);
    // Introduction tab is active by default — lr-editable is present
    const editor = page.locator('.lr-editable');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('contenteditable', 'true');
  });

  test('typing in contenteditable section updates content', async ({ page }) => {
    await navigateToPhase3(page);
    const editor = page.locator('.lr-editable');
    // Playwright's fill() works on [contenteditable] elements per the API contract
    await editor.fill('Replaced content for testing');
    await expect(editor).toContainText('Replaced content for testing');
  });

  test('"← New Review" button resets back to Phase 1', async ({ page }) => {
    await navigateToPhase3(page);
    await page.getByRole('button', { name: '← New Review' }).click();
    // Phase 1: "Literature Review Builder" heading visible, "Load My Searches" button
    await expect(page.getByRole('button', { name: /Load My Searches/ })).toBeVisible();
  });

  test('review toolbar shows paper count from fixture', async ({ page }) => {
    await navigateToPhase3(page);
    await expect(page.locator('.lr2-review__meta')).toContainText(`${fullReviewFixture.paper_count} papers`);
  });

  test('review toolbar shows topic from fixture', async ({ page }) => {
    await navigateToPhase3(page);
    await expect(page.locator('.lr2-review__meta')).toContainText(fullReviewFixture.topic);
  });
});
