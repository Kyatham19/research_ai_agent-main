# High-Level Design (HLD) — Research AI Agent

## 1. System Purpose

Research AI Agent is a full-stack academic research assistant that accepts a topic keyword, PDF file, URL, or raw text from the user, retrieves relevant academic papers from multiple open-access sources (arXiv, Semantic Scholar, OpenAlex, PubMed), analyzes each with Google Gemini 2.5 Flash using evidence-grounded prompts, synthesizes a cross-paper combined analysis, and persists all results in file-based workspaces so sessions survive browser reloads. The React frontend is served directly by Flask as a single-origin application, eliminating CORS complexity in production.

---

## 2. Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Browser (React 18 / Vite 5)                  │
│                                                                          │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────┐   ┌─────────────┐  ┌────────────┐ │
│  │ Sidebar  │   │  InputPage   │   │  ResultsPage │   │  Literature │  │   Paper    │ │
│  │ (workspace│  │ (topic/pdf/  │   │ (combined /  │   │   Review    │  │   Draft    │ │
│  │  list)   │   │  url/text)   │   │  compare /   │   │  (8-section │  │ (3-phase   │ │
│  └──────────┘   └──────┬───────┘   │  papers)     │   │  academic)  │  │  builder)  │ │
│                         │          └──────────────┘   └─────────────┘  └────────────┘ │
└─────────────────────────┼───────────────────────────────────────────────┘
                           │  HTTP (same origin, port 5000)
                           │  GET /api/workspaces, POST /analyze/topic
                           │  POST /analyze/pdf(s), POST /analyze/url
                           │  POST /analyze/text, POST /api/literature-review
                           │  POST /api/paper-draft
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Flask 3.0  (app.py)                                  │
│                                                                          │
│  ┌────────────────┐  ┌─────────────────┐  ┌────────────────────────┐   │
│  │   REST Routes  │  │  Static Server  │  │   CORS (dev only)      │   │
│  │  /analyze/*    │  │  ../frontend/   │  │   flask-cors 4.0       │   │
│  │  /api/*        │  │  dist/          │  └────────────────────────┘   │
│  └───────┬────────┘  └─────────────────┘                               │
│           │                                                              │
│     ┌─────┼──────────────────────────────┐                              │
│     ▼     ▼                              ▼                              │
│  ┌──────────┐  ┌────────────┐  ┌─────────────┐  ┌──────────────┐      │
│  │extractors│  │ analyzer   │  │  literature  │  │ paper_draft  │      │
│  │   .py    │  │   .py      │  │  _review.py  │  │    .py       │      │
│  └────┬─────┘  └─────┬──────┘  └──────┬───────┘  └──────┬───────┘     │
│       │              │                 │                                 │
│       └──────────────┴─────────────────┴───────────────┘                │
│                        │                                                 │
│                   ┌────▼────┐   ┌───────────┐                           │
│                   │  llm.py │   │ storage.py│                           │
│                   └────┬────┘   └─────┬─────┘                           │
└────────────────────────┼──────────────┼──────────────────────────────────┘
                          │              │
          ┌───────────────┘              └──────────────────┐
          ▼                                                  ▼
┌──────────────────────┐              ┌──────────────────────────────────┐
│   Google Gemini API  │              │   File System                    │
│   gemini-2.5-flash   │              │   backend/data/workspaces/       │
│   temp=0.2           │              │   workspace_<8char-uuid>/        │
│   top_p=0.9          │              │     metadata.json                │
│   max_tokens=4096    │              │     papers.json                  │
└──────────────────────┘              │     analyses.json                │
                                      │     ideas.json                   │
┌──────────────────────┐              │     chat.json                    │
│   Academic APIs      │              │     uploads/ (PDFs)              │
│   ├─ arXiv Atom XML  │              └──────────────────────────────────┘
│   ├─ Semantic Scholar│
│   ├─ OpenAlex REST   │
│   └─ PubMed NCBI     │
│     E-utilities      │
└──────────────────────┘
```

---

## 3. Technology Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Web framework | Flask | 3.0.0 | REST API server + static file serving |
| CORS middleware | flask-cors | 4.0.0 | Development cross-origin support |
| LLM provider | Google Generative AI | 0.7.2 | Gemini 2.5 Flash for all AI tasks |
| PDF extraction (primary) | PyMuPDF (fitz) | 1.23.8 | Fast, accurate PDF text extraction |
| PDF extraction (fallback) | pdfminer.six | 20221105 | Pure-Python PDF fallback |
| HTTP client | urllib (stdlib) | built-in | All external API calls (no requests dep) |
| Environment config | python-dotenv | 1.0.0 | Load GEMINI_API_KEY from .env |
| Frontend framework | React | 18.x | Component-based UI |
| Frontend build tool | Vite | 5.x | Dev server + production bundler |
| Drag-and-drop | @dnd-kit | — | PDF multi-file drag-drop UI |
| Storage | JSON files (stdlib) | — | No database required |
| Concurrency | ThreadPoolExecutor | stdlib | Parallel multi-source paper fetching |
| XML parsing | xml.etree.ElementTree | stdlib | arXiv Atom XML, PubMed efetch XML |

---

## 4. High-Level Data Flow

### 4.1 Topic Search Flow

```
1. User enters topic + max_papers slider in InputPage
2. InputPage calls POST /api/workspaces to create workspace (gets workspace_id)
3. InputPage calls POST /analyze/topic {topic, max_papers, workspace_id}
4. Flask route delegates to search_papers(topic, max_results)
   4a. Gemini LLM expands topic → canonical_topic, arxiv_categories,
       search_queries[5], relevance_concepts[6], rejection_signals[3]
   4b. ThreadPoolExecutor(max_workers=4) fires 4 source functions concurrently:
       - arXiv Atom XML API (top 3 queries, category-filtered)
       - Semantic Scholar REST API (top 4 queries)
       - OpenAlex REST API (top 3 queries)
       - PubMed NCBI E-utilities (top 3 queries, ONLY if is_medical=true)
   4c. Raw results merged into all_papers list
   4d. _deduplicate() removes duplicates by arXiv ID → DOI → normalised title
   4e. _score_and_rank() scores each paper:
       - Gemini batch-scores semantic relevance 0-100 per paper
       - Citation score: log-normalised citation count × 100
       - Recency score: age-based decay (≤3yr=100, ≤5yr=60-100, ≤10yr=30-60)
       - Source score: PubMed=90, S2=75, OpenAlex=70, arXiv=60
       - Composite = 0.50×semantic + 0.25×citation + 0.15×recency + 0.10×source
       - Papers scoring below 20 are dropped
5. For each retrieved paper, Flask calls analyze_text(paper.abstract) via ThreadPoolExecutor(max_workers=3)
   - Single paper_combined_prompt call (halves LLM calls vs two-stage approach)
   - Returns structured JSON (20+ fields) + legacy flat keys
6. Flask calls Gemini with multi_paper_analysis_prompt for cross-paper synthesis
7. Flask persists papers.json, analyses.json, metadata.json via storage.py
8. Flask returns JSON: {topic, paper_count, individual_papers, combined_analysis, workspace_id}
9. App.jsx updates state: setResults(data), setView("results")
10. ResultsPage renders Combined / Compare / Papers views
```

### 4.2 PDF Upload Flow

```
1. User drops one or more PDFs onto InputPage drop zone
2. InputPage creates workspace, calls POST /analyze/pdf (1 file) or /analyze/pdfs (N files)
3. Flask: extract_from_pdf() reads bytes via PyMuPDF; falls back to pdfminer.six
4. Text cleaned (remove references section, citations, emails, URLs)
5. analyze_text(text) called per file → LLM structured analysis
6. For multiple PDFs: combined = analyze_text(all_text concatenated)
7. Files saved to workspace uploads/ folder, analyses.json persisted
8. Response returned to frontend
```

### 4.3 URL and Text Flows

```
URL:  Flask fetches URL content via urllib, strips HTML tags, handles arXiv abstract
      specially → analyze_text() → persist → response

Text: Raw text body from request → analyze_text() → response (no persist by default)
```

### 4.4 Literature Review Flow

```
1. User clicks Literature Reviews in Sidebar → view="literature"
2. LiteratureReview page loads workspaces (Load Papers button at top of list)
3. User selects papers from workspace list
4. POST /api/literature-review {papers, topic, workspace_id}
5. generate_literature_review() passes papers + existing analyses to Gemini
6. literature_review_prompt requests 8-section academic review as JSON with HTML content
7. Response: {introduction, background, thematic_analysis, methodology_comparison,
              dataset_comparison, research_trends, conclusion_and_gaps, conclusion,
              summary_table, themes, common_gaps, common_limitations, future_suggestions}
8. Frontend renders HTML sections as contentEditable (ref-based, cursor-safe)
9. Summary table cells are individually editable via EditableCell component
10. User can export to PDF (print dialog) or copy HTML
```

### 4.5 Paper Draft Flow

```
1. User clicks Paper Drafts in Sidebar → view="draft"
2. Phase 1 — WorkspacePicker: user loads workspace, selects up to 2 papers
3. Phase 2 — PaperSetup: user fills title*, research_question*, methodology,
              contributions, target_venue, section checkboxes (7 sections available)
4. POST /api/paper-draft {papers, title, research_question, methodology,
                          contributions, target_venue, sections}
5. generate_paper_draft() caps references at 2 papers, builds compact JSON refs
6. Single Gemini call with large_output=True (max_output_tokens=8192)
7. Response: HTML strings keyed by section name + title, research_question, paper_count
8. Phase 3 — DraftDisplay: tabbed editor, each section rendered contentEditable
9. User can export to PDF (print dialog) or Word (.docx blob download)
```

---

## 5. Key Architectural Decisions

### 5.1 Single-Origin Deployment (Flask serves React)

Flask is configured with `static_folder='../frontend/dist'`. All routes not matching an API path fall back to `index.html`, implementing the SPA pattern. This means the production deployment is a single `python app.py` command — no separate frontend server, no CORS policy needed in production, and no reverse proxy required. During development, `flask-cors` is active to allow the Vite dev server (port 5173) to call Flask (port 5000).

**Rationale:** Simplifies deployment for a project that may run on a developer's local machine or a single server. Eliminates the most common class of production bugs (CORS, mixed content, relative URL mismatches).

### 5.2 File-Based JSON Storage (No Database)

Each workspace is a directory under `backend/data/workspaces/workspace_<8char-uuid>/` containing five JSON files and an `uploads/` subdirectory. All reads/writes go through `storage.py` which uses `json.load` / `json.dump`.

**Rationale:** Zero infrastructure overhead. No connection pooling, no schema migrations, no database server to install. The data volumes are small (tens of workspaces, each a few hundred KB). The trade-off is no concurrent write safety and no query capability — acceptable for a single-user local application.

### 5.3 LLM-First with Regex/Keyword Fallback

Every LLM call in `llm.py` (`call_llm`) wraps Gemini's response with two-level JSON extraction: first a direct `json.loads` on the stripped response, then a regex search for `{...}` or `[...]` in the raw text. If both fail, a `ValueError` is raised and the caller falls back to:
- `_fallback_analyze()` in `analyzer.py` (regex phrase matching)
- `_keyword_relevance_scores()` in `extractors.py` (keyword overlap)
- `_fallback_literature_review()` in `literature_review.py` (sentence extraction)

**Rationale:** Gemini occasionally produces markdown-fenced JSON or trailing text. The two-level extraction handles both common failure modes. The fallbacks ensure the application returns useful (though less rich) results even without a valid API key or when the model is unavailable.

### 5.4 Concurrent Multi-Source Paper Fetching

`search_papers()` uses `ThreadPoolExecutor(max_workers=4)` to fire all four source search functions simultaneously. Each source runs multiple query variants in its own thread function. Results from all sources are merged into a single list before deduplication and scoring.

**Rationale:** Sequential fetching across four sources with three query variants each would take 30-60 seconds. Concurrent fetching reduces wall-clock time to the slowest single source (typically 5-10 seconds). Python's GIL does not block I/O-bound threads, making this effective without multiprocessing overhead.

### 5.5 Dual Structured/Legacy Output Schema

`analyze_text()` returns both a rich structured schema (20+ nested fields like `research_gaps.from_limitations`, `future_scope.author_suggested`) and a set of flat legacy keys (`summary`, `important_sentences`, `contributions`, `methods`, `evaluation_metrics`, `research_gaps_flat`, `future_scope_flat`).

**Rationale:** The structured schema supports deep UI features (tabbed gap categories, structured datasets table). The legacy flat keys allow `ResultsPage.jsx` to render content with simple array iteration using the same component for topic results, PDF results, and URL results without branching on schema version. Backward compatibility is maintained as the API evolves.

### 5.6 Topic Intelligence via LLM Expansion

Before any paper search, `expand_topic()` calls Gemini with a structured prompt asking for `canonical_topic`, `domain`, `is_medical`, `arxiv_categories`, `search_queries[5]`, `relevance_concepts[6]`, and `rejection_signals[3]`. This drives all downstream decisions: which arXiv categories to filter, whether to query PubMed, what queries to run, and what the LLM relevance scorer should look for.

**Rationale:** A raw user query like "diabetic retinopathy detection" is ambiguous to a search API. LLM expansion produces targeted query variants and domain signals that improve precision across all four sources simultaneously, without hard-coded domain mappings.
