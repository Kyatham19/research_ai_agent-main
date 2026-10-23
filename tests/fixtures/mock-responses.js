// Shared mock API response fixtures used across all spec files.
// Shapes match the actual Flask API contracts documented in docs/api/api-reference.md.

const paperBase = {
  title: 'Attention Is All You Need',
  abstract: 'We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.',
  authors: ['Ashish Vaswani', 'Noam Shazeer'],
  published: '2017-06-12',
  year: '2017',
  url: 'https://arxiv.org/abs/1706.03762',
  source: 'arXiv',
  venue: 'NeurIPS',
  citations: 50000,
  relevance_score: 92,
  semantic_score: 90,
  citation_score: 100,
  recency_score: 60,
  source_score: 60,
  // Analysis fields
  executive_summary: 'Introduces the Transformer architecture based on self-attention.',
  research_problem: 'RNN and CNN limitations for sequence transduction tasks.',
  motivation: 'Need for parallelizable, long-range dependency models.',
  research_gap: 'Sequential computation prevents parallelization in existing models.',
  main_contribution: 'Transformer architecture using only attention mechanisms.',
  methodology: {
    overview: 'Encoder-decoder with multi-head self-attention layers.',
    key_components: ['Multi-head attention', 'Positional encoding', 'Feed-forward layers'],
    novelty: 'First model relying entirely on self-attention for sequence-to-sequence tasks.',
  },
  datasets: [{ name: 'WMT 2014', type: 'translation', size: '4.5M pairs', domain: 'NLP' }],
  evaluation: {
    metrics: ['BLEU score'],
    baselines: ['LSTM', 'CNN seq2seq'],
    protocol: 'Standard machine translation benchmarks',
  },
  research_gaps: {
    from_limitations: ['High memory complexity O(n^2) for long sequences'],
    from_missing_datasets: ['Limited evaluation on non-English languages'],
    from_missing_benchmarks: [],
    from_generalization: ['Unclear performance on very long documents'],
    from_deployment: ['Inference speed on edge devices'],
    from_unsolved_problems: [],
  },
  future_scope: {
    author_suggested: ['Apply to images, audio, video'],
    ai_generated: ['Efficient attention variants for longer sequences'],
  },
  results_and_findings: ['State-of-the-art BLEU on WMT 2014 EN-DE', '28.4 BLEU on EN-DE translation'],
  strengths: ['Parallelizable training', 'Strong performance', 'Interpretable attention'],
  weaknesses: ['Quadratic memory complexity', 'No inherent position awareness'],
  limitations: ['Quadratic complexity limits very long sequences'],
  key_takeaways: ['Attention alone is sufficient for strong NLP performance'],
  keywords: [
    { term: 'transformer', score: 98 },
    { term: 'attention mechanism', score: 95 },
    { term: 'sequence transduction', score: 80 },
  ],
  stats: { word_count: 7200, sentence_count: 320, avg_sentence_length: 22.5, unique_words: 2100 },
  // Legacy flat keys
  summary: 'Introduces the Transformer architecture based solely on attention mechanisms for NLP tasks.',
  important_sentences: ['The Transformer allows for significantly more parallelization.'],
  contributions: ['Transformer architecture using multi-head self-attention'],
  methods: ['Multi-head attention', 'Positional encoding'],
  research_gaps_flat: ['Quadratic memory complexity limits long sequences'],
  future_scope_flat: ['Efficient attention for longer sequences'],
  evaluation_metrics: ['BLEU score'],
};

const paper2 = {
  ...paperBase,
  title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
  abstract: 'We introduce a new language representation model called BERT, which stands for Bidirectional Encoder Representations from Transformers.',
  authors: ['Jacob Devlin', 'Ming-Wei Chang'],
  published: '2018-10-11',
  year: '2018',
  url: 'https://arxiv.org/abs/1810.04805',
  citations: 40000,
  main_contribution: 'Bidirectional pre-training for language understanding.',
  summary: 'BERT introduces bidirectional transformers for language pre-training.',
  research_gaps_flat: ['Limited to English pre-training corpus initially'],
  future_scope_flat: ['Multilingual pre-training', 'Domain-specific BERT variants'],
};

const combinedAnalysis = {
  ...paperBase,
  title: 'Combined Analysis: 2 Papers',
  summary: 'Combined synthesis of 2 papers on transformer architectures and language models.',
  research_gaps_flat: ['Quadratic memory complexity', 'Limited multilingual evaluation'],
  future_scope_flat: ['Efficient attention mechanisms', 'Multilingual pre-training'],
  contributions: ['Transformer architecture', 'Bidirectional pre-training'],
  keywords: [
    { term: 'transformer', score: 98 },
    { term: 'BERT', score: 95 },
    { term: 'attention', score: 90 },
  ],
  stats: { word_count: 14400, sentence_count: 640, avg_sentence_length: 22.5, unique_words: 3800 },
};

// ─── Topic search response ────────────────────────────────────────────────────
exports.topicResultFixture = {
  _mode: 'topic',
  topic: 'Retrieval-Augmented Generation',
  paper_count: 2,
  individual_papers: [paperBase, paper2],
  combined_analysis: combinedAnalysis,
  workspace_id: 'test1234',
};

// ─── Single PDF analysis response ────────────────────────────────────────────
exports.singlePdfFixture = {
  _mode: 'pdf',
  ...paperBase,
  title: 'sample.pdf',
  source: 'sample.pdf',
};

// ─── Multi-PDF analysis response ─────────────────────────────────────────────
exports.multiPdfFixture = {
  _mode: 'pdf',
  paper_count: 2,
  papers: [
    { ...paperBase, title: 'doc1.pdf', source: 'doc1.pdf' },
    { ...paperBase, title: 'doc2.pdf', source: 'doc2.pdf' },
  ],
  combined: combinedAnalysis,
};

// ─── URL analysis response ────────────────────────────────────────────────────
exports.urlFixture = {
  _mode: 'url',
  ...paperBase,
  title: 'Understanding Retrieval-Augmented Generation',
  source: 'url',
};

// ─── Text analysis response ───────────────────────────────────────────────────
exports.textFixture = {
  _mode: 'text',
  ...paperBase,
  title: 'Pasted Text Analysis',
  source: 'text',
};

// ─── Workspace list item ──────────────────────────────────────────────────────
exports.workspaceFixture = {
  id: 'ws123456',
  query: 'Retrieval-Augmented Generation',
  created_at: '2026-06-14T10:00:00.000000Z',
  last_opened: '2026-06-14T10:05:00.000000Z',
  favorite: false,
  paper_count: 2,
  mode: 'topic',
};

exports.favoritedWorkspaceFixture = {
  id: 'ws654321',
  query: 'Transformer Architecture',
  created_at: '2026-06-13T08:00:00.000000Z',
  last_opened: '2026-06-13T09:00:00.000000Z',
  favorite: true,
  paper_count: 3,
  mode: 'topic',
};

// ─── Full workspace (GET /api/workspaces/:id) ─────────────────────────────────
exports.fullWorkspaceFixture = {
  metadata: {
    id: 'ws123456',
    query: 'Retrieval-Augmented Generation',
    created_at: '2026-06-14T10:00:00.000000Z',
    last_opened: '2026-06-14T10:05:00.000000Z',
    favorite: false,
    paper_count: 2,
    mode: 'topic',
  },
  papers: [paperBase, paper2],
  analyses: [paperBase, paper2],
  ideas: [],
  chat: [],
};

// ─── Literature review response ───────────────────────────────────────────────
exports.reviewFixture = {
  introduction: '# Introduction\n\nThis literature review examines recent advances in transformer-based language models and their applications to natural language processing tasks. The papers reviewed represent foundational work that has shaped the field significantly.',
  background: '## Background\n\nThe evolution of neural network architectures for NLP has accelerated with the introduction of attention mechanisms.',
  thematic_analysis: '## Thematic Analysis\n\n### Theme 1: Attention Mechanisms\nBoth papers leverage multi-head attention as a core component. The original Transformer paper introduced this concept, while BERT extended it to bidirectional pre-training.\n\n### Theme 2: Transfer Learning\nPre-training on large corpora and fine-tuning on downstream tasks has become the dominant paradigm.',
  methodology_comparison: '## Methodology Comparison\n\nThe Transformer uses encoder-decoder attention for seq2seq tasks, while BERT uses only the encoder with masked language modeling.',
  dataset_comparison: '## Dataset Comparison\n\nBoth papers use large-scale text corpora. The Transformer evaluates on WMT translation benchmarks, BERT on BooksCorpus and Wikipedia.',
  research_trends: '## Research Trends\n\nThe field has moved toward increasingly large pre-trained models with broader task coverage.',
  conclusion_and_gaps: '## Conclusion and Research Gaps\n\nKey gaps include: efficient attention for long sequences, multilingual coverage, and computational efficiency for deployment.',
  conclusion: '## Conclusion\n\nTransformer-based models have fundamentally changed NLP. Future work should address efficiency and accessibility.',
  summary_table: [
    {
      title: 'Attention Is All You Need',
      authors: 'Vaswani et al.',
      year: '2017',
      url: 'https://arxiv.org/abs/1706.03762',
      key_findings: 'Introduced the Transformer architecture with multi-head self-attention achieving state-of-the-art translation.',
    },
    {
      title: 'BERT: Pre-training of Deep Bidirectional Transformers',
      authors: 'Devlin et al.',
      year: '2018',
      url: 'https://arxiv.org/abs/1810.04805',
      key_findings: 'Bidirectional pre-training enables strong performance across 11 NLP benchmarks.',
    },
  ],
};
