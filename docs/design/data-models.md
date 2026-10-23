# Data Models — Research AI Agent

This document defines the JSON schemas and example payloads for every data structure persisted to disk or exchanged between the backend and frontend.

---

## 1. Workspace Metadata

**File:** `backend/data/workspaces/workspace_<id>/metadata.json`

**Written by:** `storage.create_workspace()`, updated by `update_metadata()`, `update_last_opened()`, `toggle_favorite()`, `save_papers()`.

### 1.1 Schema

```json
{
  "id":           "string  — 8-character hex UUID fragment (first 8 chars of uuid4())",
  "query":        "string  — the original search term, filename, URL, or text truncation",
  "created_at":   "string  — UTC ISO-8601 timestamp with trailing Z (e.g. 2024-03-15T10:22:04.123456Z)",
  "last_opened":  "string  — UTC ISO-8601 timestamp, updated on every GET /api/workspaces/<wid>",
  "favorite":     "boolean — true if user starred this workspace",
  "paper_count":  "integer — number of papers in papers.json (updated by save_papers)",
  "mode":         "string  — one of: 'topic' | 'pdf' | 'url' | 'text'"
}
```

### 1.2 Field Descriptions

| Field | Type | Description |
|---|---|---|
| `id` | string | Short workspace identifier. Derived from `str(uuid.uuid4())[:8]`. Collision probability is low for typical usage (tens of workspaces). |
| `query` | string | The human-readable label for this workspace. For topic mode: the topic string. For PDF mode: comma-joined filenames. For URL mode: the URL. For text mode: first 60 characters of text + "...". |
| `created_at` | string | ISO-8601 UTC timestamp set once at creation. Never updated. |
| `last_opened` | string | ISO-8601 UTC timestamp updated every time `GET /api/workspaces/<wid>` is called. Used to sort the sidebar list (most recent first). |
| `favorite` | boolean | User-toggled via `POST /api/favorite/<wid>`. Favorites appear in a separate section in the sidebar above Recent. |
| `paper_count` | integer | Count of papers in `papers.json`. Set to 0 on creation. Updated by `save_papers()`. Also updated by `update_metadata()` calls from `analyze_topic`. |
| `mode` | string | Determines how the frontend reconstructs the results view when loading a workspace from the sidebar. `'topic'` triggers multi-paper view; others trigger single-analysis view. |

### 1.3 Example

```json
{
  "id": "3b94059e",
  "query": "transformer attention mechanisms in vision",
  "created_at": "2024-03-15T10:22:04.123456Z",
  "last_opened": "2024-03-15T14:35:12.654321Z",
  "favorite": true,
  "paper_count": 8,
  "mode": "topic"
}
```

---

## 2. Paper

**File:** `backend/data/workspaces/workspace_<id>/papers.json` (list of paper objects)

**Written by:** `storage.save_papers()`, called from the `analyze/topic` route after retrieval.

### 2.1 Schema

```json
{
  "title":            "string  — paper title, whitespace-normalised",
  "abstract":         "string  — paper abstract, whitespace-normalised",
  "authors":          "array[string] — author names, up to 6",
  "year":             "string  — 4-digit publication year (e.g. '2023')",
  "published":        "string  — publication date: 'YYYY-MM-DD' (arXiv/S2) or 'YYYY' (PubMed/OpenAlex)",
  "url":              "string  — best available link to the paper (see URL priority below)",
  "citations":        "integer — citation count from source API (0 if unavailable)",
  "source":           "string  — source name(s): 'arXiv' | 'Semantic Scholar' | 'OpenAlex' | 'PubMed' | 'OpenAlex, Semantic Scholar' (merged)",
  "venue":            "string  — journal or conference name, or 'arXiv' / 'PubMed' if not available",
  "_arxiv_id":        "string  — arXiv paper ID (e.g. '2310.01848'), empty string if not applicable",
  "_doi":             "string  — DOI without 'https://doi.org/' prefix, lowercase, empty if unavailable",
  "relevance_score":  "float   — composite relevance score 0-100 (added by scoring pipeline)",
  "semantic_score":   "float   — LLM semantic relevance score 0-100",
  "citation_score":   "float   — log-normalised citation score 0-100",
  "recency_score":    "float   — age-decay recency score 0-100",
  "source_score":     "float   — source authority score (PubMed=90, S2=75, OpenAlex=70, arXiv=60)"
}
```

### 2.2 URL Priority (per source)

| Source | URL selection |
|---|---|
| arXiv | Raw arXiv abstract URL from Atom feed (`https://arxiv.org/abs/<id>`) |
| Semantic Scholar | `openAccessPdf.url` → `https://arxiv.org/abs/<arxivId>` → `https://doi.org/<doi>` → `https://pubmed.ncbi.nlm.nih.gov/<pmid>/` → `""` |
| OpenAlex | `open_access.oa_url` → `https://doi.org/<doi>` → `""` |
| PubMed | `https://pubmed.ncbi.nlm.nih.gov/<pmid>/` |
| Merged (deduplication) | Existing URL if non-empty; candidate URL otherwise |

### 2.3 Field Descriptions

| Field | Type | Description |
|---|---|---|
| `title` | string | Paper title with newlines collapsed. |
| `abstract` | string | Paper abstract. For OpenAlex, reconstructed from inverted index. For PubMed, structured sections joined with label prefixes (e.g., "BACKGROUND: ... METHODS: ..."). |
| `authors` | array[string] | Author display names, capped at 6 to keep payloads small. |
| `year` | string | 4-digit year string. Used for recency scoring. String type to handle missing/unknown years gracefully (empty string gets neutral score 50.0). |
| `published` | string | More precise date if available (arXiv: `YYYY-MM-DD`; PubMed/OpenAlex: `YYYY`). Used as display date in frontend. |
| `url` | string | Best available URL for the paper. May be empty string if no link is available. |
| `citations` | integer | Raw citation count. 0 for arXiv and PubMed (neither provides counts). |
| `source` | string | Originating source(s). Comma-joined if paper was found in multiple sources (deduplication merges `source` fields). |
| `venue` | string | Publication venue. `"arXiv"` for preprints. `"PubMed"` if journal not identified. Empty string if not available. |
| `_arxiv_id` | string | Internal deduplication key. Not displayed in UI. |
| `_doi` | string | Internal deduplication key. Not displayed in UI. |
| `relevance_score` | float | Final composite score. Papers below 20 are filtered out before this field is written. |
| `semantic_score` | float | Gemini's relevance score for this paper vs. the topic's `relevance_concepts`. |
| `citation_score` | float | Log-normalised citation count, scaled 0-100 relative to the most-cited paper in the candidate pool. |
| `recency_score` | float | Age-based score. Papers ≤3 years old score 100. |
| `source_score` | float | Fixed by source: PubMed=90, Semantic Scholar=75, OpenAlex=70, arXiv=60. Multi-source papers take the max. |

### 2.4 Example

```json
{
  "title": "An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale",
  "abstract": "While the Transformer architecture has become the de-facto standard for natural language processing tasks, its applications to computer vision remain limited. We show that this reliance on CNNs is not necessary and a pure transformer applied directly to sequences of image patches can perform very well on image classification tasks.",
  "authors": ["Alexey Dosovitskiy", "Lucas Beyer", "Alexander Kolesnikov", "Dirk Weissenborn"],
  "year": "2020",
  "published": "2020-10-22",
  "url": "https://arxiv.org/abs/2010.11929",
  "citations": 48230,
  "source": "OpenAlex, Semantic Scholar",
  "venue": "International Conference on Learning Representations",
  "_arxiv_id": "2010.11929",
  "_doi": "10.48550/arxiv.2010.11929",
  "relevance_score": 94.2,
  "semantic_score": 97.0,
  "citation_score": 100.0,
  "recency_score": 60.0,
  "source_score": 75.0
}
```

---

## 3. Analysis Result

**File:** `backend/data/workspaces/workspace_<id>/analyses.json` (list of analysis objects)

**Written by:** `storage.save_analyses()`. Called from `analyze/pdf`, `analyze/pdfs`, `analyze/url`, and `analyze/topic` routes.

The analysis result contains two overlapping schema layers: a **structured layer** (produced by Gemini analysis) and a **legacy flat layer** (backward-compatible aliases added via `setdefault`). Both are always present.

### 3.1 Structured Schema

```json
{
  "executive_summary":    "string  — 3-4 sentence summary citing specific findings",
  "research_problem":     "string  — the specific unsolved problem the paper targets",
  "motivation":           "string  — why the problem matters; grounded in paper evidence",
  "research_gap":         "string  — the gap in prior work this paper fills",
  "main_contribution":    "string  — the primary novel contribution: method, architecture, or framework name",
  "field_maturity_assessment": "string — optional; present in multi-paper synthesis only",

  "methodology": {
    "overview":        "string  — high-level description of the approach",
    "key_components":  "array[string] — list of major technical components with purpose",
    "novelty":         "string  — what is technically new vs. prior work"
  },

  "datasets": [
    {
      "name":   "string — dataset name (e.g. 'ImageNet', 'COCO')",
      "type":   "string — 'public benchmark' | 'proprietary' | 'curated' | 'unknown'",
      "size":   "string — number of samples if stated, else 'unknown'",
      "domain": "string — what the data represents (e.g. 'natural images', 'medical scans')"
    }
  ],

  "evaluation": {
    "metrics":   "array[string] — evaluation metrics used (e.g. 'Top-1 accuracy', 'mAP')",
    "baselines": "array[string] — models or methods compared against",
    "protocol":  "string — how evaluation was set up (train/test split, cross-validation, etc.)"
  },

  "results_and_findings": "array[string] — specific findings with numbers where available",
  "strengths":            "array[string] — evidence-based strengths",
  "weaknesses":           "array[string] — what a peer reviewer would flag",
  "limitations":          "array[string] — explicitly stated or clearly implied limitations",

  "research_gaps": {
    "from_limitations":        "array[string] — gaps derived from stated limitations",
    "from_missing_datasets":   "array[string] — gaps from narrow data coverage",
    "from_missing_benchmarks": "array[string] — gaps from missing benchmark evaluations",
    "from_generalization":     "array[string] — gaps from untested domain generalization",
    "from_deployment":         "array[string] — gaps from unaddressed deployment challenges",
    "from_unsolved_problems":  "array[string] — fundamental problems left open"
  },

  "future_scope": {
    "author_suggested": "array[string] — future work explicitly stated by the authors",
    "ai_generated":     "array[string] — future work inferred from gaps and limitations, with reasoning chain"
  },

  "key_takeaways": "array[string] — the most important insights from this paper",
  "keywords":      "array[{term: string, score: number}] — ranked technical terms",

  "stats": {
    "word_count":          "integer — total word count of input text",
    "sentence_count":      "integer — count of sentences longer than 30 characters",
    "avg_sentence_length": "float   — words per sentence, rounded to 1 decimal",
    "unique_words":        "integer — count of distinct lowercase word tokens"
  }
}
```

### 3.2 Legacy Flat Keys

These keys are added by `analyze_text()` using `setdefault` so they do not overwrite structured values if present. They provide backward-compatible access for UI components.

```json
{
  "summary":             "string  — alias for executive_summary",
  "important_sentences": "array[string] — alias for key_takeaways",
  "contributions":       "array[string] — [main_contribution] (single-element list)",
  "methods":             "array[string] — [methodology.overview] (single-element list)",
  "evaluation_metrics":  "array[string] — alias for evaluation.metrics",
  "research_gaps_flat":  "array[string] — all research_gaps sub-lists concatenated into one flat list",
  "future_scope_flat":   "array[string] — author_suggested + ai_generated concatenated"
}
```

### 3.3 Topic-Mode Additional Keys

When analysis results are produced by `analyze/topic`, these keys are merged into each individual paper analysis dict before storage:

```json
{
  "title":           "string  — paper title from retrieval",
  "authors":         "array[string] — author names from retrieval",
  "year":            "string  — 4-digit publication year",
  "published":       "string  — full publication date string",
  "url":             "string  — paper URL",
  "source":          "string  — originating source(s)",
  "venue":           "string  — publication venue",
  "citations":       "integer — citation count",
  "abstract":        "string  — abstract text (stored alongside analysis)",
  "relevance_score": "float",
  "semantic_score":  "float",
  "citation_score":  "float",
  "recency_score":   "float",
  "source_score":    "float"
}
```

### 3.4 Fallback Analysis Schema Differences

When `_fallback_analyze()` runs (LLM unavailable), the output schema is structurally identical but field values are regex-extracted strings rather than LLM-generated content. Notable differences:

- `research_gaps.from_generalization` and `from_missing_benchmarks` may be empty lists.
- `methodology.key_components` contains detected ML method names (e.g., `["Transformer", "Bert"]`).
- `keywords` is produced by bigram/unigram frequency counting.
- `strengths` and `weaknesses` use sentence pattern matching on `"novel"`, `"outperform"`, `"limitation"`, `"drawback"`.
- An additional legacy-only key `research_gaps_legacy` is present (list from phrase matching).

### 3.5 Example (Structured + Legacy)

```json
{
  "executive_summary": "This paper presents the Vision Transformer (ViT), which applies a standard Transformer encoder directly to sequences of 16×16 image patches. When pre-trained on large datasets (JFT-300M), ViT achieves 88.55% top-1 accuracy on ImageNet, matching or exceeding state-of-the-art CNNs while requiring fewer computational resources to train.",
  "research_problem": "Convolutional neural networks have dominated computer vision for a decade, but their inductive biases (translation equivariance, local connectivity) may limit performance when large amounts of training data are available.",
  "motivation": "Transformers have achieved state-of-the-art results in NLP by attending to all token pairs, but the quadratic cost of full self-attention over pixels has prevented their direct application to images.",
  "research_gap": "Prior work applying attention to images either used it in conjunction with CNNs (DETR, non-local means) or used it on individual pixels with approximations. No prior work had demonstrated a pure Transformer without any convolutional layers that was competitive with state-of-the-art CNNs on standard benchmarks.",
  "main_contribution": "Vision Transformer (ViT): a pure Transformer encoder applied to non-overlapping fixed-size image patches treated as tokens, with position embeddings and a classification token.",
  "methodology": {
    "overview": "Images are split into 16×16 patches, each linearly projected to a fixed embedding dimension. A learnable [CLS] token is prepended. Position embeddings are added. A standard Transformer encoder processes the sequence. The [CLS] token representation is used for classification.",
    "key_components": [
      "Patch embedding: linear projection of flattened 16×16 patch pixels to D dimensions",
      "Learnable [CLS] token: prepended token whose final state serves as the image representation",
      "1D learnable position embeddings: added to patch embeddings before Transformer input",
      "Standard Transformer encoder: alternating multi-head self-attention and MLP blocks with LayerNorm"
    ],
    "novelty": "First demonstration that a pure Transformer (no convolutional layers) can match or exceed CNNs on image recognition when pre-trained on sufficient data, removing the architectural bias of CNNs from vision models."
  },
  "datasets": [
    {"name": "ImageNet-1k", "type": "public benchmark", "size": "1.28M training images", "domain": "natural images, 1000 classes"},
    {"name": "ImageNet-21k", "type": "public benchmark", "size": "14M images", "domain": "natural images, 21841 classes"},
    {"name": "JFT-300M", "type": "proprietary", "size": "300M images", "domain": "natural images, 18291 classes"}
  ],
  "evaluation": {
    "metrics": ["Top-1 accuracy", "Top-5 accuracy"],
    "baselines": ["ResNet (BiT)", "EfficientNet", "Noisy Student"],
    "protocol": "Pre-train on ImageNet-21k or JFT-300M, fine-tune on downstream datasets at higher resolution. Few-shot evaluation using 5-shot linear readout for scalability experiments."
  },
  "results_and_findings": [
    "ViT-H/14 pre-trained on JFT-300M achieves 88.55% top-1 on ImageNet, surpassing prior SOTA by 0.1%",
    "ViT requires substantially less compute to pre-train than comparable ResNets: ViT-L/16 trained in 2500 TPU-v3 core-days vs. ResNet152x4 in 9900 core-days",
    "On VTAB benchmark (19 tasks), ViT-H achieves 77.63%, outperforming CNNs on structured and specialized tasks but not always on natural image tasks"
  ],
  "strengths": [
    "Demonstrates that architectural biases of CNNs are not necessary for high-performance vision when data is abundant",
    "Superior computational efficiency at large scale: fewer FLOPs per accuracy point than ResNets",
    "Attention maps show semantically meaningful patch attention even without explicit supervision"
  ],
  "weaknesses": [
    "Requires very large pre-training datasets (JFT-300M) to match CNN performance — impractical for most practitioners",
    "Underperforms ResNets when trained on ImageNet-1k alone, suggesting poor data efficiency at small scale",
    "Position embeddings are 1D and do not model 2D spatial structure; 2D-aware encoding may improve results"
  ],
  "limitations": [
    "The model does not scale well to small datasets without pre-training; fails to match ResNets on ImageNet-1k alone",
    "16×16 patch size is fixed; smaller patches increase sequence length quadratically",
    "No exploration of tasks beyond classification (detection, segmentation not addressed)"
  ],
  "research_gaps": {
    "from_limitations": [
      "Efficient ViT variants for small-data regimes remain unexplored in this work"
    ],
    "from_missing_datasets": [
      "Evaluation is limited to natural image datasets; performance on medical imaging, satellite imagery, or microscopy is unknown"
    ],
    "from_missing_benchmarks": [
      "No evaluation on COCO detection or ADE20K segmentation benchmarks"
    ],
    "from_generalization": [
      "Generalization to video understanding requires temporal modeling not addressed here"
    ],
    "from_deployment": [
      "Inference latency at high resolution is not analyzed; quadratic attention cost may be prohibitive for real-time applications"
    ],
    "from_unsolved_problems": [
      "The minimum dataset size at which ViT becomes competitive with CNNs without large pre-training remains undefined"
    ]
  },
  "future_scope": {
    "author_suggested": [
      "Apply ViT to detection and segmentation tasks",
      "Explore self-supervised pre-training analogous to BERT for vision"
    ],
    "ai_generated": [
      "Given the quadratic attention cost with patch count, future work should investigate linear attention approximations (e.g., Performer, Linformer) to enable ViT at higher resolutions without the 16×16 patch constraint",
      "The paper evaluates only on natural images; extending ViT to medical imaging (e.g., histopathology, fundus images) would test whether learned patch semantics transfer to radically different visual domains",
      "The reliance on 300M proprietary images (JFT-300M) limits reproducibility; self-supervised pretraining on unlabeled web images could democratize ViT-scale training"
    ]
  },
  "key_takeaways": [
    "Pure Transformers can match CNN performance on image recognition when trained on sufficient data, removing the last major CNN stronghold",
    "ViT's performance scales predictably with data and model size, unlike CNNs which plateau earlier",
    "The architectural inductive biases of CNNs are a helpful prior only when data is limited"
  ],
  "keywords": [
    {"term": "vision transformer", "score": 12},
    {"term": "image patches", "score": 9},
    {"term": "self-attention", "score": 8},
    {"term": "patch embedding", "score": 7},
    {"term": "pre-training", "score": 7},
    {"term": "ImageNet", "score": 6}
  ],
  "stats": {
    "word_count": 312,
    "sentence_count": 18,
    "avg_sentence_length": 17.3,
    "unique_words": 198
  },

  "summary": "This paper presents the Vision Transformer (ViT), which applies a standard Transformer encoder directly to sequences of 16×16 image patches. When pre-trained on large datasets (JFT-300M), ViT achieves 88.55% top-1 accuracy on ImageNet, matching or exceeding state-of-the-art CNNs while requiring fewer computational resources to train.",
  "important_sentences": [
    "Pure Transformers can match CNN performance on image recognition when trained on sufficient data, removing the last major CNN stronghold",
    "ViT's performance scales predictably with data and model size, unlike CNNs which plateau earlier",
    "The architectural inductive biases of CNNs are a helpful prior only when data is limited"
  ],
  "contributions": [
    "Vision Transformer (ViT): a pure Transformer encoder applied to non-overlapping fixed-size image patches treated as tokens, with position embeddings and a classification token."
  ],
  "methods": [
    "Images are split into 16×16 patches, each linearly projected to a fixed embedding dimension. A learnable [CLS] token is prepended. Position embeddings are added. A standard Transformer encoder processes the sequence. The [CLS] token representation is used for classification."
  ],
  "evaluation_metrics": ["Top-1 accuracy", "Top-5 accuracy"],
  "research_gaps_flat": [
    "Efficient ViT variants for small-data regimes remain unexplored in this work",
    "Evaluation is limited to natural image datasets; performance on medical imaging, satellite imagery, or microscopy is unknown",
    "No evaluation on COCO detection or ADE20K segmentation benchmarks",
    "Generalization to video understanding requires temporal modeling not addressed here",
    "Inference latency at high resolution is not analyzed; quadratic attention cost may be prohibitive for real-time applications",
    "The minimum dataset size at which ViT becomes competitive with CNNs without large pre-training remains undefined"
  ],
  "future_scope_flat": [
    "Apply ViT to detection and segmentation tasks",
    "Explore self-supervised pre-training analogous to BERT for vision",
    "Given the quadratic attention cost with patch count, future work should investigate linear attention approximations...",
    "The paper evaluates only on natural images; extending ViT to medical imaging..."
  ]
}
```

---

## 4. Chat Message

**File:** `backend/data/workspaces/workspace_<id>/chat.json` (list of message objects)

**Written by:** `storage.save_chat_message()`, called from `POST /api/workspaces/<wid>/chat`.

### 4.1 Schema

```json
{
  "id":        "string  — 8-character hex UUID fragment",
  "role":      "string  — 'user' | 'assistant'",
  "content":   "string  — message body text",
  "timestamp": "string  — UTC ISO-8601 timestamp with trailing Z"
}
```

### 4.2 Field Descriptions

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier for this message within the chat history. Generated as `str(uuid.uuid4())[:8]`. |
| `role` | string | Who sent the message. `"user"` for messages sent by the user; `"assistant"` for messages from the AI. Note: the current implementation stores messages as provided via the API; there is no active chat AI backend — this field is reserved for a future chat feature. |
| `content` | string | The full message text. Validated to be non-empty after strip before saving. |
| `timestamp` | string | UTC time the message was saved. Appended in insertion order; the list in `chat.json` is ordered by timestamp ascending. |

### 4.3 Example (`chat.json` contents)

```json
[
  {
    "id": "a1b2c3d4",
    "role": "user",
    "content": "What are the main limitations of Vision Transformers compared to CNNs?",
    "timestamp": "2024-03-15T14:35:12.654321Z"
  },
  {
    "id": "e5f6g7h8",
    "role": "assistant",
    "content": "Based on the papers analyzed, Vision Transformers have three key limitations relative to CNNs: data efficiency (they require large pre-training datasets), computational cost at high resolution (quadratic attention over patches), and lack of inductive spatial biases which hurts performance on small datasets.",
    "timestamp": "2024-03-15T14:35:18.123456Z"
  }
]
```

---

## 5. Literature Review Response

**Returned by:** `POST /api/literature-review`

**Not persisted to disk** in the current implementation (future: could be saved as `literature_review.json` in the workspace).

### 5.1 Schema

```json
{
  "topic":       "string  — the research topic label (from request or 'the selected research area')",
  "paper_count": "integer — number of papers included in this review",

  "introduction":           "string  — HTML content for Section 1 (<h2>, <p> tags)",
  "background":             "string  — HTML content for Section 2",
  "thematic_analysis":      "string  — HTML content for Section 3 (may include <h3> subsections)",
  "methodology_comparison": "string  — HTML content for Section 4 (empty string if LLM skipped it)",
  "dataset_comparison":     "string  — HTML content for Section 5 (empty string if LLM skipped it)",
  "research_trends":        "string  — HTML content for Section 6 (empty string if LLM skipped it)",
  "conclusion_and_gaps":    "string  — HTML content for Section 7 (includes <ul> lists for gaps/limitations/future)",
  "conclusion":             "string  — HTML content for Section 8 (empty string if LLM skipped it)",

  "summary_table": [
    {
      "title":            "string — paper title",
      "authors":          "string — 'Last et al. (year)' formatted citation label",
      "research_problem": "string — the specific problem addressed (up to 250 chars)",
      "contribution":     "string — main contribution (up to 250 chars)",
      "methodology":      "string — methods used (up to 200 chars)",
      "datasets":         "string — comma-joined dataset names (up to 150 chars)",
      "key_results":      "string — key quantitative or qualitative result (up to 200 chars)",
      "limitations":      "string — main limitation (up to 200 chars)",
      "url":              "string — paper URL (injected from source paper list if LLM left blank)"
    }
  ],

  "themes":               "array[string] — 2-4 thematic labels identified across papers",
  "trajectory_notes":     "array[string] — always [] in current implementation (reserved)",
  "common_gaps":          "array[string] — up to 6 evidence-based research gaps",
  "common_limitations":   "array[string] — up to 5 recurring limitations across papers",
  "future_suggestions":   "array[string] — up to 6 specific future research directions"
}
```

### 5.2 HTML Section Format

All eight section fields contain HTML strings rendered with `dangerouslySetInnerHTML` in the React frontend. The standard structure is:

```html
<!-- introduction -->
<h2>1. Introduction</h2>
<p>First paragraph establishing the research domain and scope of this review...</p>
<p>Second paragraph introducing key themes...</p>

<!-- thematic_analysis (with subsections) -->
<h2>3. Thematic Analysis</h2>
<h3>3.1 Methodological Approaches</h3>
<p>Synthesis paragraph referencing at least 2 papers...</p>
<h3>3.2 Empirical Evaluation</h3>
<p>...</p>

<!-- conclusion_and_gaps -->
<h2>7. Research Gaps, Limitations &amp; Future Directions</h2>
<h3>7.1 Research Gaps</h3>
<ul>
  <li>Gap 1 with evidence citation...</li>
  <li>Gap 2...</li>
</ul>
<h3>7.2 Common Limitations</h3>
<ul>
  <li>Recurring limitation 1...</li>
</ul>
<h3>7.3 Future Research Directions</h3>
<ul>
  <li>Specific actionable direction 1...</li>
</ul>
```

When the LLM skips a section or the fallback generator runs, `methodology_comparison`, `dataset_comparison`, `research_trends`, and `conclusion` may be empty strings. The frontend should render nothing (or a placeholder) for empty strings.

### 5.3 Field Descriptions

| Field | Type | Description |
|---|---|---|
| `topic` | string | The topic label used as the review title and in section headings. |
| `paper_count` | integer | Total papers included. Used in section text ("N papers reviewed"). |
| `introduction` | string | HTML. Must mention number of papers and time span covered (per prompt rules). |
| `background` | string | HTML. Describes foundational context and evolution of approaches. |
| `thematic_analysis` | string | HTML. Synthesises papers by theme — NOT sequential per-paper summaries. Each subsection must reference at least 2 papers. |
| `methodology_comparison` | string | HTML. Compares methodological families across papers. May be empty string in fallback. |
| `dataset_comparison` | string | HTML. Compares datasets used; identifies under-represented domains. May be empty string in fallback. |
| `research_trends` | string | HTML. Describes trajectory of the field. May be empty string in fallback. |
| `conclusion_and_gaps` | string | HTML. The most critical section: contains `<ul>` lists of research gaps, recurring limitations, and future directions. Always populated (fallback generator extracts from abstracts if needed). |
| `conclusion` | string | HTML. Summarises what the body of work establishes. May be empty string in fallback. |
| `summary_table` | array[object] | One row per paper. LLM-generated or fallback-generated. All string fields are truncated to safe lengths. `url` is injected post-LLM from the original paper list if the LLM left it blank. |
| `themes` | array[string] | Short labels (2-4 words each) identifying thematic clusters. Empty list in fallback. |
| `trajectory_notes` | array[string] | Reserved for future use. Always `[]`. |
| `common_gaps` | array[string] | Up to 6 evidence-based gap descriptions. Must cite which papers reveal each gap. |
| `common_limitations` | array[string] | Up to 5 limitations that appear across multiple papers. |
| `future_suggestions` | array[string] | Up to 6 specific, actionable future research directions. Prompt rules prohibit generic suggestions ("more data", "larger models"). |

### 5.4 Example (abridged)

```json
{
  "topic": "Vision Transformer Attention Mechanisms",
  "paper_count": 5,

  "introduction": "<h2>1. Introduction</h2><p>This literature review synthesizes findings from <strong>5 papers</strong> in the field of <strong>Vision Transformer Attention Mechanisms</strong>, covering research published between 2020–2023. The reviewed papers collectively examine how self-attention can replace or augment convolutional operations in visual recognition tasks.</p><p>The review identifies three dominant themes: patch-based tokenization strategies, efficiency improvements to quadratic attention cost, and the role of pre-training scale in determining competitiveness with CNNs.</p>",

  "background": "<h2>2. Background</h2><p>Prior to 2020, convolutional neural networks (CNNs) dominated computer vision benchmarks through inductive biases suited to images: local connectivity and translation equivariance. The success of self-attention in NLP (Vaswani et al., 2017) prompted exploration of attention mechanisms in vision, initially as supplements to CNNs (non-local means, DETR) rather than replacements.</p><p>The papers reviewed here represent the first wave of pure-Transformer vision architectures that challenged the assumption that convolutional priors are necessary for high-performance image understanding.</p>",

  "thematic_analysis": "<h2>3. Thematic Analysis</h2><h3>3.1 Data Efficiency vs. Scale</h3><p>Dosovitskiy et al. (2020) and Touvron et al. (2021) reveal a fundamental tension: ViT achieves superior performance only at large pre-training scales (300M+ images), while DeiT demonstrates that knowledge distillation from a CNN teacher enables competitive performance on ImageNet-1k alone. This disagreement about the role of data quantity defines the field's central open question.</p><h3>3.2 Efficient Attention Mechanisms</h3><p>Wang et al. (2021) and Liu et al. (2021) independently propose window-based attention (PVT, Swin Transformer) to reduce the quadratic attention cost. Both find that hierarchical feature maps with local windows recover much of the performance of global attention at a fraction of the FLOPs, but neither fully resolves the trade-off between local and global context.</p>",

  "conclusion_and_gaps": "<h2>7. Research Gaps, Limitations &amp; Future Directions</h2><h3>7.1 Research Gaps</h3><ul><li>No paper evaluates ViT-family models on medical imaging benchmarks (revealed by absence in Dosovitskiy et al., Touvron et al., and Liu et al.)</li><li>The minimum pre-training dataset size at which pure Transformers become competitive with CNNs without distillation remains undefined (implied by data efficiency gap in Dosovitskiy et al.)</li><li>Temporal extension of patch-based tokenization to video remains unaddressed across all five papers</li></ul><h3>7.2 Common Limitations</h3><ul><li>Quadratic attention cost with sequence length prevents high-resolution processing (appears in Dosovitskiy et al., Wang et al., Liu et al.)</li><li>Evaluation restricted to natural image classification and detection; medical, satellite, and microscopy domains not tested</li></ul><h3>7.3 Future Research Directions</h3><ul><li>Linear attention approximations (Performer, Cosformer) applied to vision Transformers to enable ViT at resolutions above 224×224 without patch-size trade-offs</li><li>Self-supervised pre-training for ViT analogous to MAE or BEiT to reduce dependence on large labeled datasets</li><li>Systematic evaluation of ViT attention mechanisms on out-of-distribution tasks (medical imaging, satellite imagery) to test domain generalization of learned patch semantics</li></ul>",

  "summary_table": [
    {
      "title": "An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale",
      "authors": "Dosovitskiy et al. (2020)",
      "research_problem": "CNNs dominate vision but Transformer architectures are unexplored as pure image classifiers",
      "contribution": "Vision Transformer (ViT): pure Transformer applied to 16×16 image patches",
      "methodology": "Patch embedding + positional encoding + standard Transformer encoder + classification head",
      "datasets": "ImageNet-1k, ImageNet-21k, JFT-300M",
      "key_results": "88.55% top-1 on ImageNet with JFT-300M pre-training, matching SOTA CNNs",
      "limitations": "Requires very large pre-training datasets; underperforms CNNs on ImageNet-1k alone",
      "url": "https://arxiv.org/abs/2010.11929"
    }
  ],

  "themes": [
    "Data efficiency and pre-training scale",
    "Efficient attention mechanisms",
    "Hierarchical feature representations"
  ],
  "trajectory_notes": [],
  "common_gaps": [
    "No paper evaluates on medical or satellite imaging benchmarks",
    "Minimum pre-training scale for competitive performance without distillation is undefined",
    "Video understanding extension not addressed in any paper"
  ],
  "common_limitations": [
    "Quadratic attention cost limits high-resolution processing across all papers",
    "Evaluation restricted to natural image benchmarks (ImageNet, COCO)"
  ],
  "future_suggestions": [
    "Linear attention approximations to enable ViT at higher resolutions",
    "Self-supervised pre-training to reduce labeled data dependency",
    "Cross-domain evaluation on medical and satellite imagery"
  ]
}
```

---

## 6. Summary: All Persisted Files per Workspace

```
workspace_<id>/
├── metadata.json      — {id, query, created_at, last_opened, favorite, paper_count, mode}
├── papers.json        — [{title, abstract, authors, year, published, url, citations, source,
│                          venue, _arxiv_id, _doi, relevance_score, semantic_score,
│                          citation_score, recency_score, source_score}, ...]
├── analyses.json      — [{executive_summary, research_problem, motivation, research_gap,
│                          main_contribution, methodology{...}, datasets[...], evaluation{...},
│                          results_and_findings[], strengths[], weaknesses[], limitations[],
│                          research_gaps{6 sub-keys}, future_scope{author_suggested, ai_generated},
│                          key_takeaways[], keywords[], stats{...},
│                          summary, important_sentences, contributions, methods,
│                          evaluation_metrics, research_gaps_flat, future_scope_flat,
│                          [+ title, authors, year, url, etc. for topic mode]}, ...]
├── ideas.json         — [] (reserved; always empty in current implementation)
├── chat.json          — [{id, role, content, timestamp}, ...]
└── uploads/
    └── <filename>.pdf — raw binary PDF files from /analyze/pdf and /analyze/pdfs
```

Note: `literature_review.json` does not exist in the current implementation. Literature review responses are computed on demand and returned directly to the client. The `workspace_id` in the literature review request is received but not used to persist the result.
