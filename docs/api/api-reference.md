# API Reference — Research AI Agent

## Overview

The Research AI Agent exposes a REST API served by Flask 3.0 on the backend. The React SPA frontend is served from the same origin (`frontend/dist/`), so in production there is a single origin for both the UI and the API.

**Base URL:** `http://localhost:5000`

**Authentication:** None. There are no API keys, tokens, or session cookies required from callers. The Gemini API key (`GEMINI_API_KEY`) is loaded server-side from environment variables or a `.env` file and is never exposed to clients.

**Content-Type:** All request bodies that carry JSON must set `Content-Type: application/json`. File upload endpoints use `multipart/form-data`. All responses are `application/json`.

**CORS:** Flask-CORS is enabled globally, so the API can be called from any origin during development.

---

## Table of Contents

1. [Health](#1-health)
2. [Workspace Endpoints](#2-workspace-endpoints)
   - [List Workspaces](#21-list-workspaces)
   - [Create Workspace](#22-create-workspace)
   - [Get Workspace](#23-get-workspace)
   - [Delete Workspace](#24-delete-workspace)
   - [Toggle Favorite](#25-toggle-favorite)
   - [Add Chat Message](#26-add-chat-message)
3. [Literature Review](#3-literature-review)
4. [Paper Draft](#4-paper-draft)
5. [Analysis Endpoints](#5-analysis-endpoints)
   - [Analyze Text](#51-analyze-text)
   - [Analyze PDF](#52-analyze-pdf)
   - [Analyze Multiple PDFs](#53-analyze-multiple-pdfs)
   - [Analyze URL](#54-analyze-url)
   - [Analyze Topic](#55-analyze-topic)
6. [Static / SPA Fallback](#6-static--spa-fallback)
7. [Data Schemas](#7-data-schemas)
   - [Paper Object](#71-paper-object)
   - [Analysis Object](#72-analysis-object)
   - [Literature Review Response](#73-literature-review-response)
   - [Paper Draft Response](#74-paper-draft-response)

---

## 1. Health

### `GET /health`

Returns the server health status and LLM configuration state. Use this to verify the backend is running and the Gemini API key is present before making analysis requests.

**Request:** No body, no parameters.

**Response — 200 OK**

| Field | Type | Description |
|---|---|---|
| `status` | `string` | Always `"ok"` when the server is reachable |
| `llm` | `string` | LLM model identifier. Currently `"gemini-2.5-flash"` |
| `api_key_configured` | `boolean` | `true` if `GEMINI_API_KEY` is set in the environment |

```json
{
  "status": "ok",
  "llm": "gemini-2.5-flash",
  "api_key_configured": true
}
```

> If `api_key_configured` is `false`, all analysis endpoints will fall back to regex-based extraction. The server will still return results, but quality will be significantly degraded.

---

## 2. Workspace Endpoints

Workspaces are persistent research sessions stored as directories under `backend/data/workspaces/`. Each workspace holds papers, analyses, chat history, and metadata in JSON files.

### 2.1 List Workspaces

#### `GET /api/workspaces`

Returns all saved workspaces, sorted by the storage layer (typically last-opened descending).

**Request:** No body, no parameters.

**Response — 200 OK** — Array of workspace summary objects.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | UUID workspace identifier |
| `query` | `string` | Original search query or filename that created the workspace |
| `created_at` | `string` | ISO 8601 creation timestamp |
| `last_opened` | `string` | ISO 8601 timestamp of last access |
| `favorite` | `boolean` | Whether the user has starred this workspace |
| `paper_count` | `integer` | Number of papers stored in this workspace |
| `mode` | `string` | How this workspace was created: `"topic"`, `"pdf"`, or `"url"` |

```json
[
  {
    "id": "3b94059e-...",
    "query": "transformer models for medical imaging",
    "created_at": "2024-03-01T10:23:45Z",
    "last_opened": "2024-03-02T08:00:00Z",
    "favorite": false,
    "paper_count": 8,
    "mode": "topic"
  }
]
```

---

### 2.2 Create Workspace

#### `POST /api/workspaces`

Creates a new empty workspace. The workspace is persisted immediately. Papers and analyses are added later via the analysis endpoints by passing `workspace_id`.

**Content-Type:** `application/json`

**Request Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `query` | `string` | No | Label for this workspace. Defaults to `"Untitled"` if omitted or blank. |

```json
{ "query": "attention mechanisms survey" }
```

**Response — 201 Created**

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Generated UUID for this workspace |
| `query` | `string` | The query string as stored (trimmed) |
| `created_at` | `string` | ISO 8601 creation timestamp |
| `last_opened` | `string` | Same as `created_at` at creation time |
| `favorite` | `boolean` | Always `false` at creation |
| `paper_count` | `integer` | Always `0` at creation |
| `mode` | `string` | Always `"topic"` at creation |

```json
{
  "id": "a98e617b-4f2c-4a1d-8e3f-...",
  "query": "attention mechanisms survey",
  "created_at": "2024-03-05T14:30:00Z",
  "last_opened": "2024-03-05T14:30:00Z",
  "favorite": false,
  "paper_count": 0,
  "mode": "topic"
}
```

---

### 2.3 Get Workspace

#### `GET /api/workspaces/<wid>`

Loads a full workspace including all papers, analyses, ideas, and chat history. Calling this endpoint automatically updates `last_opened` in the workspace metadata.

**Path Parameters**

| Parameter | Type | Description |
|---|---|---|
| `wid` | `string` | UUID workspace ID |

**Response — 200 OK**

| Field | Type | Description |
|---|---|---|
| `metadata` | `object` | Same fields as the workspace summary in [List Workspaces](#21-list-workspaces) |
| `papers` | `array` | Array of [Paper Objects](#61-paper-object) stored in this workspace |
| `analyses` | `array` | Array of [Analysis Objects](#62-analysis-object) for each paper |
| `ideas` | `array` | Reserved array for user-saved research ideas (may be empty) |
| `chat` | `array` | Array of chat message objects (see [Add Chat Message](#26-add-chat-message)) |

```json
{
  "metadata": {
    "id": "a98e617b-...",
    "query": "attention mechanisms",
    "mode": "topic",
    "paper_count": 3,
    "favorite": false,
    "created_at": "2024-03-05T14:30:00Z",
    "last_opened": "2024-03-05T15:00:00Z"
  },
  "papers": [ ... ],
  "analyses": [ ... ],
  "ideas": [],
  "chat": [ ... ]
}
```

**Error Responses**

| Status | Body | Condition |
|---|---|---|
| 404 | `{"error": "Not found"}` | No workspace with the given `wid` exists |

---

### 2.4 Delete Workspace

#### `DELETE /api/workspaces/<wid>`

Permanently deletes a workspace and all its stored data (papers, analyses, chat, uploaded files).

**Path Parameters**

| Parameter | Type | Description |
|---|---|---|
| `wid` | `string` | UUID workspace ID |

**Response — 200 OK**

```json
{ "deleted": true }
```

**Error Responses**

| Status | Body | Condition |
|---|---|---|
| 404 | `{"error": "Not found"}` | No workspace with the given `wid` exists |

---

### 2.5 Toggle Favorite

#### `POST /api/favorite/<wid>`

Toggles the `favorite` flag on a workspace. If it is currently `false`, it becomes `true`, and vice versa.

**Path Parameters**

| Parameter | Type | Description |
|---|---|---|
| `wid` | `string` | UUID workspace ID |

**Request:** No body required.

**Response — 200 OK**

| Field | Type | Description |
|---|---|---|
| `favorite` | `boolean` | The new value of the favorite flag after toggling |

```json
{ "favorite": true }
```

---

### 2.6 Add Chat Message

#### `POST /api/workspaces/<wid>/chat`

Appends a message to the workspace's chat history. The server persists the message with a generated ID and timestamp. Note: this endpoint only stores messages — it does not call the LLM to generate a reply. Chat turns (both user and assistant) are stored individually.

**Path Parameters**

| Parameter | Type | Description |
|---|---|---|
| `wid` | `string` | UUID workspace ID |

**Content-Type:** `application/json`

**Request Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `role` | `string` | No | `"user"` or `"assistant"`. Defaults to `"user"` if omitted. |
| `content` | `string` | Yes | The message text. Must be non-empty after trimming. |

```json
{
  "role": "user",
  "content": "What are the main research gaps identified across these papers?"
}
```

**Response — 201 Created**

| Field | Type | Description |
|---|---|---|
| `id` | `string` | UUID message identifier |
| `role` | `string` | The role as stored (`"user"` or `"assistant"`) |
| `content` | `string` | The message text as stored |
| `timestamp` | `string` | ISO 8601 timestamp of when the message was saved |

```json
{
  "id": "msg-9d9fa319-...",
  "role": "user",
  "content": "What are the main research gaps identified across these papers?",
  "timestamp": "2024-03-05T15:01:00Z"
}
```

**Error Responses**

| Status | Body | Condition |
|---|---|---|
| 400 | `{"error": "Empty message"}` | `content` is missing or whitespace-only |

---

## 3. Literature Review

### `POST /api/literature-review`

Generates a formal 8-section academic literature review from a set of pre-retrieved papers. The review is synthesized by Gemini using a structured academic writing protocol (see [llm-prompts.md](./llm-prompts.md) for the full prompt design).

This endpoint expects papers that have already been fetched and optionally analyzed. If paper `analysis` objects are included, they are used to produce richer section content.

**Content-Type:** `application/json`

**Request Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `papers` | `array` | Yes | Array of paper objects. Must contain at least 2 items. |
| `topic` | `string` | No | The research topic for the review. Used as the review title and passed to the LLM. |
| `workspace_id` | `string\|null` | No | If provided, the generated review data is not currently auto-saved (workspace_id is accepted but not used for storage in the current implementation). |

**Minimum paper object fields for this endpoint:**

| Field | Type | Description |
|---|---|---|
| `title` | `string` | Paper title |
| `abstract` | `string` | Paper abstract text |
| `authors` | `array` | Author name strings |
| `published` | `string` | Publication date/year string |
| `url` | `string` | Link to the paper |
| `analysis` | `object` | Optional. Pre-computed analysis object from `/analyze/*` endpoints. Enriches review quality significantly. |

**Validation:** Returns 400 if `papers` array has fewer than 2 items.

**Response — 200 OK** — See [Literature Review Response Schema](#63-literature-review-response).

**Error Responses**

| Status | Body | Condition |
|---|---|---|
| 400 | `{"error": "At least 2 papers required"}` | Fewer than 2 papers in the request |

---

## 4. Paper Draft

### `POST /api/paper-draft`

Generates a full, publication-quality research paper draft from a set of pre-retrieved papers and user-supplied configuration. Sections are returned as HTML strings ready to render in-browser.

This endpoint makes one Gemini call with `large_output=True` (`max_output_tokens=8192`). On the free tier, only 2 reference papers are used to stay within token limits.

**Content-Type:** `application/json`

**Request Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `papers` | `array` | Yes | Array of paper objects (with analyses). Only the first 2 are used as references. |
| `title` | `string` | Yes | Working title for the paper draft. |
| `research_question` | `string` | Yes | The core research objective or question the paper addresses. |
| `methodology` | `string` | No | Proposed methodology. If omitted, Gemini derives one from the reference papers. |
| `contributions` | `string` | No | Key contributions. If omitted, Gemini infers from the research question and gaps. |
| `target_venue` | `string` | No | Target journal or conference (e.g., `"NeurIPS"`, `"IEEE TPAMI"`). Defaults to general academic publication. |
| `sections` | `array<string>` | Yes | Sections to generate. Valid values: `"abstract"`, `"introduction"`, `"related_work"`, `"methodology"`, `"results_discussion"`, `"conclusion"`, `"references"`. |

```json
{
  "papers": [ ... ],
  "title": "Transformer-Based Retinal Disease Detection",
  "research_question": "Can vision transformers outperform CNNs for multi-class retinal disease classification on limited datasets?",
  "methodology": "Fine-tuned ViT-B/16 with data augmentation on the APTOS 2019 dataset",
  "contributions": "First systematic comparison of ViT variants on diabetic retinopathy grading",
  "target_venue": "IEEE TPAMI",
  "sections": ["abstract", "introduction", "related_work", "methodology", "results_discussion", "conclusion", "references"]
}
```

**Response — 200 OK**

Each requested section is returned as an HTML string. Only keys for requested sections are present.

| Field | Type | Description |
|---|---|---|
| `abstract` | `string` | HTML `<p>` tags with abstract content |
| `introduction` | `string` | HTML with `<h2>1. Introduction</h2>` + `<p>` paragraphs |
| `related_work` | `string` | HTML with `<h2>2. Related Work</h2>` + paragraphs |
| `methodology` | `string` | HTML with `<h2>3. Methodology</h2>` + paragraphs |
| `results_discussion` | `string` | HTML with `<h2>4. Results and Discussion</h2>` + paragraphs |
| `conclusion` | `string` | HTML with `<h2>5. Conclusion</h2>` + paragraphs |
| `references` | `string` | HTML with `<h2>References</h2>` + `<ol><li>` citations |
| `title` | `string` | The title as provided in the request |
| `research_question` | `string` | The research question as provided |
| `paper_count` | `integer` | Total number of papers passed in (including those beyond the 2-paper cap) |

**Error Responses**

| Status | Body | Condition |
|---|---|---|
| 400 | `{"error": "title and research_question required"}` | Either required field is missing or empty |
| 429 | `{"error": "Gemini API rate limit exceeded. Please wait a minute and retry."}` | Free-tier quota exhausted during generation |

> All generated sections are editable in-browser via the Paper Draft UI's `contentEditable` interface. Export to PDF (print dialog) and Word (`.docx` blob download) are available from the Draft Display phase.

---

## 5. Analysis Endpoints

All analysis endpoints call `analyze_text()` internally, which invokes Gemini with a chain-of-thought research analysis prompt. If the LLM is unavailable or fails, a regex-based fallback is used automatically. All four analysis endpoints return an [Analysis Object](#62-analysis-object).

### 5.1 Analyze Text

#### `POST /analyze/text`

Analyzes raw text (e.g., a paper abstract or body pasted directly).

**Content-Type:** `application/json`

**Request Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `text` | `string` | Yes | The paper text to analyze. Must be non-empty after trimming. Minimum 50 characters; shorter text returns `{"error": "Text too short for analysis"}`. |

```json
{
  "text": "We propose a novel transformer-based architecture for retinal disease detection..."
}
```

**Response — 200 OK** — [Analysis Object](#62-analysis-object).

**Error Responses**

| Status | Body | Condition |
|---|---|---|
| 400 | `{"error": "No text provided"}` | `text` field is missing or empty |

---

### 5.2 Analyze PDF

#### `POST /analyze/pdf`

Extracts text from a single PDF file and analyzes it. The PDF parser (PyMuPDF preferred, pdfminer fallback) strips references sections, email addresses, and institution blocks before sending text to the LLM. Only the first 7000 characters of the extracted text are sent to the Gemini prompt.

If `workspace_id` is provided, the uploaded PDF file is saved to the workspace's file storage, and the resulting analysis is persisted.

**Content-Type:** `multipart/form-data`

**Form Fields**

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | `file` | Yes | The PDF file to upload and analyze |
| `workspace_id` | `string` | No | If present, saves the file and analysis to this workspace; also sets workspace `mode` to `"pdf"` and updates `query` to the filename |

**Response — 200 OK** — [Analysis Object](#62-analysis-object) with one additional field:

| Field | Type | Description |
|---|---|---|
| `source` | `string` | The original filename of the uploaded PDF |

**Error Responses**

| Status | Body | Condition |
|---|---|---|
| 400 | `{"error": "No file uploaded"}` | No file part in the multipart request |
| 400 | `{"error": "Could not extract text"}` | PDF text extraction failed or yielded less than 100 characters |

---

### 5.3 Analyze Multiple PDFs

#### `POST /analyze/pdfs`

Uploads and analyzes multiple PDF files in a single request. Each PDF is analyzed independently. A combined cross-paper synthesis is also produced using the multi-paper analysis prompt (or the `_merge_analyses()` fallback if the LLM call fails).

**Content-Type:** `multipart/form-data`

**Form Fields**

| Field | Type | Required | Description |
|---|---|---|---|
| `files` | `file[]` | Yes | One or more PDF files. Field name must be `files` (plural). |
| `workspace_id` | `string` | No | If present, all successfully parsed PDFs are saved to this workspace, and their analyses are persisted. |

**Response — 200 OK**

| Field | Type | Description |
|---|---|---|
| `papers` | `array` | Array of [Analysis Objects](#62-analysis-object), one per successfully parsed PDF. Each object has `title` and `source` set to the filename. |
| `combined` | `object` | If more than one PDF was parsed: a cross-paper synthesis [Analysis Object](#62-analysis-object). If only one PDF was parsed, `combined` is identical to `papers[0]`. Has `title` set to `"Combined: N PDFs"`. |
| `paper_count` | `integer` | Number of PDFs successfully parsed |

```json
{
  "papers": [ { "title": "paper1.pdf", "source": "paper1.pdf", ... }, ... ],
  "combined": { "title": "Combined: 2 PDFs", ... },
  "paper_count": 2
}
```

**Error Responses**

| Status | Body | Condition |
|---|---|---|
| 400 | `{"error": "No files uploaded"}` | No files in the request |
| 400 | `{"error": "Could not extract text from any PDF"}` | Every uploaded PDF failed text extraction |

> PDFs that fail text extraction are silently skipped; the error is only returned if all PDFs fail.

---

### 5.4 Analyze URL

#### `POST /analyze/url`

Fetches the content at a URL and analyzes it as a research paper. For arXiv PDF URLs (`arxiv.org/pdf/...`), the URL is rewritten to the abstract page (`/abs/`) before fetching. For arXiv abstract pages, the abstract block is extracted from the HTML. For other URLs, the full page HTML is stripped of scripts and style blocks, then all tags are removed.

**Content-Type:** `application/json`

**Request Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | `string` | Yes | The URL to fetch and analyze. Must be non-empty after trimming. |
| `workspace_id` | `string\|null` | No | If present, saves the analysis to this workspace; sets workspace `mode` to `"url"` and `query` to the URL. |

```json
{
  "url": "https://arxiv.org/abs/2303.08774",
  "workspace_id": "a98e617b-..."
}
```

**Response — 200 OK** — [Analysis Object](#62-analysis-object) with one additional field:

| Field | Type | Description |
|---|---|---|
| `source` | `string` | The original URL that was analyzed |

**Error Responses**

| Status | Body | Condition |
|---|---|---|
| 400 | `{"error": "No URL provided"}` | `url` field is missing or empty |
| 400 | `{"error": "Could not extract content"}` | HTTP request failed, the page returned no parseable text, or the resulting text was under 100 characters |

---

### 5.5 Analyze Topic

#### `POST /analyze/topic`

The most complex analysis endpoint. Runs a full multi-stage pipeline:

1. **Topic expansion** — Gemini expands the query into 5 search queries and relevance concepts.
2. **Multi-source retrieval** — Searches arXiv, Semantic Scholar, OpenAlex, and PubMed (medical topics only) concurrently via `ThreadPoolExecutor`.
3. **Deduplication** — Papers are merged by arXiv ID, DOI, and normalized title similarity.
4. **Relevance scoring** — Gemini scores each paper 0–100 for relevance; papers scoring below 20 are dropped.
5. **Composite ranking** — Final score = 50% semantic + 25% citation + 15% recency + 10% source authority.
6. **Individual analysis** — Each top-N paper is analyzed individually via `analyze_text()`.
7. **Combined synthesis** — A cross-paper synthesis is produced via the multi-paper analysis prompt.

**Content-Type:** `application/json`

**Request Body**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `topic` | `string` | Yes | — | The research topic to search and analyze. Must be non-empty. |
| `max_papers` | `integer` | No | `10` | Maximum number of papers to return after ranking. The pipeline fetches 3× this number before filtering. |
| `workspace_id` | `string\|null` | No | `null` | If provided, saves papers, analyses, and updates workspace metadata (`mode: "topic"`, `paper_count`). |

```json
{
  "topic": "diabetic retinopathy detection using deep learning",
  "max_papers": 8,
  "workspace_id": "a98e617b-..."
}
```

**Response — 200 OK**

| Field | Type | Description |
|---|---|---|
| `topic` | `string` | The topic string as received |
| `paper_count` | `integer` | Number of papers returned |
| `individual_papers` | `array` | Array of [Analysis Objects](#62-analysis-object) enriched with paper metadata (title, authors, year, url, source, venue, citations, all relevance scores) |
| `combined_analysis` | `object` | Cross-paper synthesis. When Gemini succeeds, this is a full synthesis object (see [Analysis Object — Combined Synthesis Fields](#combined-synthesis-fields)). When it fails, it is the `_merge_analyses()` fallback object. Has `title` set to `"Combined: <topic>"`. |
| `workspace_id` | `string\|null` | The workspace ID as received |

```json
{
  "topic": "diabetic retinopathy detection using deep learning",
  "paper_count": 8,
  "individual_papers": [ ... ],
  "combined_analysis": { "title": "Combined: diabetic retinopathy detection using deep learning", ... },
  "workspace_id": "a98e617b-..."
}
```

**Individual paper objects in `individual_papers`** include all [Analysis Object](#62-analysis-object) fields plus these additional metadata fields:

| Field | Type | Description |
|---|---|---|
| `title` | `string` | Paper title from retrieval |
| `authors` | `array` | Author name strings |
| `year` | `string` | Publication year (4-digit string) |
| `published` | `string` | Full publication date string or year |
| `url` | `string` | Link to paper (arXiv, DOI, PubMed, or open-access PDF) |
| `source` | `string` | Retrieval source(s): `"arXiv"`, `"Semantic Scholar"`, `"OpenAlex"`, `"PubMed"`, or comma-separated if deduplicated from multiple |
| `venue` | `string` | Journal or conference name (empty for arXiv) |
| `citations` | `integer` | Citation count (0 for arXiv and PubMed papers) |
| `relevance_score` | `float` | Composite ranking score (0–100) |
| `semantic_score` | `float` | LLM semantic relevance score (0–100) |
| `citation_score` | `float` | Log-normalized citation score (0–100) |
| `recency_score` | `float` | Recency score (100 for ≤3 years old, decays after that) |
| `source_score` | `float` | Source authority score (PubMed=90, Semantic Scholar=75, OpenAlex=70, arXiv=60) |

**Error Responses**

| Status | Body | Condition |
|---|---|---|
| 400 | `{"error": "No topic provided"}` | `topic` is missing or empty after trimming |
| 404 | `{"error": "No papers found for this topic"}` | The retrieval pipeline returned 0 papers from all sources and the mock fallback was also empty |

---

## 6. Static / SPA Fallback

The Flask server serves the compiled React frontend from `frontend/dist/`.

| Route | Behavior |
|---|---|
| `GET /` | Serves `frontend/dist/index.html` |
| `GET /<path>` | Serves the file at `frontend/dist/<path>` if it exists; otherwise serves `index.html` (SPA client-side routing fallback) |

These routes have lower precedence than all `/api/*` and `/analyze/*` routes.

---

## 7. Data Schemas

### 7.1 Paper Object

Paper objects are stored in workspaces and returned in the `papers` array of a workspace GET response and as `individual_papers` in the topic analysis response.

| Field | Type | Description |
|---|---|---|
| `title` | `string` | Paper title |
| `abstract` | `string` | Full abstract text |
| `authors` | `array<string>` | Author names (up to 6) |
| `year` | `string` | Publication year as 4-digit string |
| `published` | `string` | Full date string (e.g. `"2023-07-15"`) or year string |
| `url` | `string` | Link to paper. Priority: open-access PDF > arXiv abstract > DOI > PubMed |
| `citations` | `integer` | Citation count. `0` for arXiv and PubMed sources. |
| `source` | `string` | Data source: `"arXiv"`, `"Semantic Scholar"`, `"OpenAlex"`, `"PubMed"`, or comma-separated combination |
| `venue` | `string` | Journal or conference name. Empty string for preprints. |
| `relevance_score` | `float` | Composite relevance score 0–100 |
| `semantic_score` | `float` | LLM semantic relevance 0–100 |
| `citation_score` | `float` | Log-normalized citation score 0–100 |
| `recency_score` | `float` | Age-based recency score 0–100 |
| `source_score` | `float` | Source authority score 0–100 |

---

### 7.2 Analysis Object

All `/analyze/*` endpoints return an analysis object. The object has two layers:

- **Structured fields** (primary) — Nested objects and arrays produced by the Gemini chain-of-thought prompt.
- **Legacy flat fields** (back-compat) — Flat string/array aliases added by `analyze_text()` for compatibility with earlier UI consumers.

#### Structured Fields

| Field | Type | Description |
|---|---|---|
| `executive_summary` | `string` | 3–4 sentence summary. States problem, approach, key result, and significance with specific numbers. |
| `research_problem` | `string` | The specific unsolved problem the paper targets, quoted or closely paraphrased from the paper. |
| `motivation` | `string` | Why this problem matters; what breaks without solving it. Evidence-grounded. |
| `research_gap` | `string` | The precise gap in prior work this paper fills. Names prior approaches that fall short and explains how. |
| `main_contribution` | `string` | The primary novel contribution — names the proposed method, architecture, or framework. |
| `methodology` | `object` | See methodology sub-fields below. |
| `methodology.overview` | `string` | High-level description of the approach. |
| `methodology.key_components` | `array<string>` | Named components with their purpose. |
| `methodology.novelty` | `string` | What is technically new compared to prior work. |
| `datasets` | `array<object>` | Datasets used. Each object has `name`, `type` (`"public benchmark"` / `"proprietary"` / `"curated"`), `size` (sample count or `"unknown"`), and `domain`. |
| `evaluation` | `object` | See evaluation sub-fields below. |
| `evaluation.metrics` | `array<string>` | Evaluation metrics (e.g., `"Accuracy"`, `"AUROC"`, `"F1"`). |
| `evaluation.baselines` | `array<string>` | Baseline models compared against. |
| `evaluation.protocol` | `string` | How evaluation was set up (train/test split, cross-validation, etc.). |
| `results_and_findings` | `array<string>` | Key results with specific numbers (e.g., `"94.3% accuracy, +2.1% over SOTA"`). |
| `strengths` | `array<string>` | Paper strengths grounded in evidence. |
| `weaknesses` | `array<string>` | What a rigorous peer reviewer would criticize. |
| `limitations` | `array<string>` | Explicitly stated or clearly implied limitations. |
| `research_gaps` | `object` | Structured gap analysis. See sub-fields below. |
| `research_gaps.from_limitations` | `array<string>` | Gaps derived from stated limitations. |
| `research_gaps.from_missing_datasets` | `array<string>` | Gaps from narrow or absent data coverage. |
| `research_gaps.from_missing_benchmarks` | `array<string>` | Gaps from lack of standard benchmark evaluations. |
| `research_gaps.from_generalization` | `array<string>` | Gaps from untested generalization to other domains or tasks. |
| `research_gaps.from_deployment` | `array<string>` | Gaps from unaddressed real-world deployment challenges. |
| `research_gaps.from_unsolved_problems` | `array<string>` | Fundamental problems the paper leaves open. |
| `future_scope` | `object` | See sub-fields below. |
| `future_scope.author_suggested` | `array<string>` | Future directions explicitly stated by the authors. |
| `future_scope.ai_generated` | `array<string>` | Future work inferred by the LLM from gaps and limitations, with reasoning chain explained. |
| `key_takeaways` | `array<string>` | The most important insights from this paper. |
| `keywords` | `array<object>` | Each object has `term` (string) and `score` (number, higher = more significant). |
| `stats` | `object` | Text statistics: `word_count` (int), `sentence_count` (int), `avg_sentence_length` (float), `unique_words` (int). |

#### Legacy Flat Fields (Back-Compat)

These fields are added by `analyze_text()` after receiving the structured LLM output. They exist to avoid breaking older UI components that expect flat keys.

| Field | Derived From | Description |
|---|---|---|
| `summary` | `executive_summary` | Same content as `executive_summary` |
| `important_sentences` | `key_takeaways` | Same content as `key_takeaways` |
| `contributions` | `main_contribution` | Single-element array wrapping `main_contribution` |
| `methods` | `methodology.overview` | Single-element array wrapping `methodology.overview` |
| `evaluation_metrics` | `evaluation.metrics` | Same content as `evaluation.metrics` |
| `research_gaps_flat` | `research_gaps` | All six `research_gaps` sub-arrays concatenated into a single flat list |
| `future_scope_flat` | `future_scope` | `author_suggested` + `ai_generated` concatenated |

#### Combined Synthesis Fields

When `POST /analyze/topic` succeeds in calling the multi-paper synthesis LLM prompt, `combined_analysis` has this extended shape (instead of the standard analysis object):

| Field | Type | Description |
|---|---|---|
| `synthesis_summary` | `string` | 5–7 sentences of cross-paper analytical prose. References specific papers. States what the field collectively knows, where it disagrees, and what remains unsolved. |
| `common_themes` | `array<object>` | Each has `theme`, `description`, `papers_involved` (array), `significance`. |
| `method_comparison` | `object` | Has `summary`, `approaches` (array of `{approach, papers, strengths, weaknesses}`), `dominant_approach`. |
| `dataset_comparison` | `object` | Has `summary`, `datasets` (array of `{name, used_by, coverage, limitations}`), `coverage_gaps`. |
| `evaluation_comparison` | `object` | Has `consistent_metrics`, `inconsistent_metrics`, `missing_evaluations`, `benchmark_gaps` (all arrays). |
| `areas_of_agreement` | `array<string>` | Findings multiple papers reach independently. |
| `areas_of_disagreement` | `array<object>` | Each has `point`, `paper_a`, `paper_b`, `implication`. |
| `research_trends` | `array<object>` | Each has `trend`, `evidence`, `trajectory`. |
| `recurring_limitations` | `array<object>` | Each has `limitation`, `appears_in` (array of paper titles), `impact`. |
| `recurring_research_gaps` | `array<object>` | Each has `gap`, `evidence`, `priority` (`"high"`/`"medium"`/`"low"`). |
| `future_research_opportunities` | `array<object>` | Each has `opportunity`, `rationale`, `novelty`. |
| `field_maturity_assessment` | `string` | One paragraph assessing research area maturity. |
| `keywords` | `array<object>` | `{term, score}` pairs. |
| `datasets` | `array<string>` | Dataset names mentioned across papers. |
| `evaluation_metrics` | `array<string>` | Metric names mentioned across papers. |
| `methods` | `array<string>` | Method or approach names mentioned across papers. |
| `stats` | `object` | Computed from all paper abstracts concatenated. Same structure as in the standard analysis object. |
| `title` | `string` | Set to `"Combined: <topic>"` |

> If the multi-paper LLM call fails, `combined_analysis` falls back to the `_merge_analyses()` function, which produces a flatter object with only: `title`, `summary`, `keywords`, `research_gaps`, `limitations`, `future_scope`, `contributions`, `methods`, `important_sentences`, and `stats`.

---

### 7.3 Literature Review Response

Returned by `POST /api/literature-review`.

| Field | Type | Description |
|---|---|---|
| `topic` | `string` | Topic label used for the review |
| `paper_count` | `integer` | Number of papers included |
| `introduction` | `string` | HTML string for section 1 (`<h2>1. Introduction</h2><p>...</p>`) |
| `background` | `string` | HTML string for section 2 |
| `thematic_analysis` | `string` | HTML string for section 3, including `<h3>` subsections per theme |
| `methodology_comparison` | `string` | HTML string for section 4 |
| `dataset_comparison` | `string` | HTML string for section 5 |
| `research_trends` | `string` | HTML string for section 6 |
| `conclusion_and_gaps` | `string` | HTML string for section 7, including Research Gaps, Common Limitations, and Future Directions sub-sections |
| `conclusion` | `string` | HTML string for section 8 |
| `summary_table` | `array<object>` | One row per paper. Each row has: `title`, `authors` (formatted as "Last et al. (year)"), `research_problem`, `contribution`, `methodology`, `datasets`, `key_results`, `limitations`, `url`. |
| `themes` | `array<string>` | Theme names extracted from thematic analysis |
| `common_gaps` | `array<string>` | Up to 6 evidence-based research gaps |
| `common_limitations` | `array<string>` | Up to 5 recurring limitations |
| `future_suggestions` | `array<string>` | Up to 6 specific future research directions |
| `trajectory_notes` | `array` | Reserved; always an empty array in the current implementation |

> All HTML section fields fall back to locally generated HTML (no LLM) if Gemini returns an empty or missing value for that section. The `introduction`, `background`, `thematic_analysis`, and `conclusion_and_gaps` sections have rich fallback generators; `methodology_comparison`, `dataset_comparison`, `research_trends`, and `conclusion` fall back to empty strings.

---

### 7.4 Paper Draft Response

Returned by `POST /api/paper-draft`. Only keys for the requested sections are present.

| Field | Type | Description |
|---|---|---|
| `abstract` | `string` | HTML `<p>` paragraphs for the abstract |
| `introduction` | `string` | HTML with `<h2>1. Introduction</h2>` heading + paragraphs |
| `related_work` | `string` | HTML with `<h2>2. Related Work</h2>` heading + paragraphs |
| `methodology` | `string` | HTML with `<h2>3. Methodology</h2>` heading + paragraphs |
| `results_discussion` | `string` | HTML with `<h2>4. Results and Discussion</h2>` heading + paragraphs |
| `conclusion` | `string` | HTML with `<h2>5. Conclusion</h2>` heading + paragraphs |
| `references` | `string` | HTML with `<h2>References</h2>` + `<ol><li>` numbered reference list |
| `title` | `string` | Paper title as provided in the request |
| `research_question` | `string` | Research question as provided in the request |
| `paper_count` | `integer` | Total papers passed (including those beyond the 2-paper cap) |

> All section values are HTML strings safe to render with `dangerouslySetInnerHTML`. The Paper Draft UI renders them in a tabbed `contentEditable` editor so the user can revise before exporting.
