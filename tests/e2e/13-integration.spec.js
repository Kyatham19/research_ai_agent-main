const { test, expect } = require('@playwright/test');
const path = require('path');

// Integration tests — hit the real Flask backend + Gemini LLM.
// Requires: python app.py running on http://localhost:5000 with GEMINI_API_KEY set.
// Run with: npm run test:integration (these are excluded from the default npm test run)

const PDF_PATH = path.join(__dirname, '..', 'fixtures', 'sample.pdf');

const LONG_TEXT = `Retrieval-Augmented Generation (RAG) is a natural language processing technique that combines
information retrieval with generative language models to produce more accurate and grounded outputs.
The core idea is to augment the parametric knowledge of pre-trained language models with non-parametric
retrieval from external document stores at inference time. This approach helps address hallucination
in large language models by providing factual evidence from retrieved documents.

In a typical RAG pipeline, a dense retriever first encodes the input query into a vector representation
and then retrieves the most semantically similar documents from an external knowledge base using
approximate nearest neighbor search. These retrieved documents are then concatenated with the original
query and passed to a generative language model which synthesizes the final response.

RAG has demonstrated strong performance on knowledge-intensive NLP tasks such as open-domain question
answering, fact-checking, and dialogue systems that require up-to-date factual knowledge beyond
what is encoded in the model parameters during training.`;

test.describe('@integration Real Backend Tests', () => {
  test.setTimeout(120_000);

  test('GET /health returns ok with api_key_configured true', async ({ request }) => {
    test.slow();
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.api_key_configured).toBe(true);
  });

  test('POST /analyze/text returns analysis with summary', async ({ request }) => {
    test.slow();
    const res = await request.post('/analyze/text', {
      data: { text: LONG_TEXT },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.summary || body.executive_summary).toBeTruthy();
  });

  test('POST /analyze/text result has keywords array', async ({ request }) => {
    test.slow();
    const res = await request.post('/analyze/text', { data: { text: LONG_TEXT } });
    const body = await res.json();
    expect(Array.isArray(body.keywords)).toBe(true);
  });

  test('POST /analyze/pdf with sample.pdf returns analysis', async ({ request }) => {
    test.slow();
    const res = await request.post('/analyze/pdf', {
      multipart: {
        file: {
          name: 'sample.pdf',
          mimeType: 'application/pdf',
          buffer: require('fs').readFileSync(PDF_PATH),
        },
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.summary || body.executive_summary).toBeTruthy();
  });

  test('topic search for "machine learning" returns papers', async ({ request }) => {
    test.slow();
    const res = await request.post('/analyze/topic', {
      data: { topic: 'machine learning', max_papers: 2 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.paper_count).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body.individual_papers)).toBe(true);
    const first = body.individual_papers[0];
    expect(first.title).toBeTruthy();
    expect(first.summary || first.executive_summary).toBeTruthy();
  });

  test('workspace created during topic search appears in list', async ({ request }) => {
    test.slow();
    // Create workspace
    const ws = await request.post('/api/workspaces', { data: { query: 'integration-test' } });
    const { id } = await ws.json();

    // Run analysis with workspace_id
    await request.post('/analyze/text', {
      data: { text: LONG_TEXT, workspace_id: id },
    });

    // Workspace should persist
    const list = await request.get('/api/workspaces');
    const body = await list.json();
    expect(body.find(w => w.id === id)).toBeTruthy();

    // Cleanup
    await request.delete(`/api/workspaces/${id}`);
  });

  test('POST /api/literature-review with 2 text fixtures returns review sections', async ({ request }) => {
    test.slow();
    const paper = {
      title: 'Test Paper',
      abstract: LONG_TEXT,
      summary: 'RAG combines retrieval and generation for better NLP outputs.',
      authors: ['Test Author'],
      year: '2024',
      keywords: [{ term: 'RAG', score: 90 }],
      research_gaps_flat: ['Scalability to large corpora'],
      methods: ['Dense retrieval', 'Generative LM'],
    };
    const res = await request.post('/api/literature-review', {
      data: { papers: [paper, { ...paper, title: 'Test Paper 2' }], topic: 'RAG' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.introduction).toBeTruthy();
    expect(Array.isArray(body.summary_table)).toBe(true);
  });
});
