const { test, expect } = require('@playwright/test');

test.describe('Backend Health', () => {
  test('GET /health returns 200 and status ok', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('GET /health reports llm model name', async ({ request }) => {
    const res = await request.get('/health');
    const body = await res.json();
    expect(body.llm).toBeTruthy();
    expect(typeof body.llm).toBe('string');
  });

  test('GET /health reports api_key_configured', async ({ request }) => {
    const res = await request.get('/health');
    const body = await res.json();
    expect(typeof body.api_key_configured).toBe('boolean');
  });
});
