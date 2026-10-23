const { test, expect } = require('@playwright/test');

// These tests use real backend API calls (no LLM required — just workspace CRUD).
// Requires Flask to be running on http://localhost:5000.

let createdId = null;

test.describe('Workspace CRUD API', () => {
  test('POST /api/workspaces creates workspace and returns id', async ({ request }) => {
    const res = await request.post('/api/workspaces', {
      data: { query: 'Playwright test workspace' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(typeof body.id).toBe('string');
    expect(body.query).toBe('Playwright test workspace');
    createdId = body.id;
  });

  test('GET /api/workspaces lists workspaces', async ({ request }) => {
    // Create one first
    const create = await request.post('/api/workspaces', { data: { query: 'list-test' } });
    const { id } = await create.json();

    const res = await request.get('/api/workspaces');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    const found = body.find(w => w.id === id);
    expect(found).toBeTruthy();
    expect(found.query).toBe('list-test');

    // Cleanup
    await request.delete(`/api/workspaces/${id}`);
  });

  test('GET /api/workspaces/:id returns full workspace object', async ({ request }) => {
    const create = await request.post('/api/workspaces', { data: { query: 'detail-test' } });
    const { id } = await create.json();

    const res = await request.get(`/api/workspaces/${id}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.metadata).toBeTruthy();
    expect(body.metadata.id).toBe(id);
    expect(Array.isArray(body.papers)).toBe(true);
    expect(Array.isArray(body.analyses)).toBe(true);

    await request.delete(`/api/workspaces/${id}`);
  });

  test('GET /api/workspaces/:nonexistent returns 404', async ({ request }) => {
    const res = await request.get('/api/workspaces/doesntexist');
    expect(res.status()).toBe(404);
  });

  test('POST /api/favorite/:id toggles favorite on', async ({ request }) => {
    const create = await request.post('/api/workspaces', { data: { query: 'fav-test' } });
    const { id } = await create.json();

    const res = await request.post(`/api/favorite/${id}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.favorite).toBe(true);

    await request.delete(`/api/workspaces/${id}`);
  });

  test('POST /api/favorite/:id toggles favorite off on second call', async ({ request }) => {
    const create = await request.post('/api/workspaces', { data: { query: 'fav-toggle-test' } });
    const { id } = await create.json();

    await request.post(`/api/favorite/${id}`);
    const res = await request.post(`/api/favorite/${id}`);
    const body = await res.json();
    expect(body.favorite).toBe(false);

    await request.delete(`/api/workspaces/${id}`);
  });

  test('DELETE /api/workspaces/:id removes workspace', async ({ request }) => {
    const create = await request.post('/api/workspaces', { data: { query: 'delete-test' } });
    const { id } = await create.json();

    const del = await request.delete(`/api/workspaces/${id}`);
    expect(del.status()).toBe(200);
    const body = await del.json();
    expect(body.deleted).toBe(true);
  });

  test('GET /api/workspaces/:id after delete returns 404', async ({ request }) => {
    const create = await request.post('/api/workspaces', { data: { query: 'delete-then-get' } });
    const { id } = await create.json();
    await request.delete(`/api/workspaces/${id}`);

    const res = await request.get(`/api/workspaces/${id}`);
    expect(res.status()).toBe(404);
  });

  test('POST /api/workspaces with no query uses default name', async ({ request }) => {
    const res = await request.post('/api/workspaces', { data: {} });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    // Cleanup
    await request.delete(`/api/workspaces/${body.id}`);
  });
});
