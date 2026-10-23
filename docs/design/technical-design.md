# Technical Design Document — Research AI Agent

## 1. Problem Statement and Goals

### 1.1 Problem Statement

Academic researchers, students, and engineers need to survey a research field quickly. The traditional approach — manually searching arXiv, Google Scholar, or PubMed; downloading papers; reading each in full — is time-consuming and scales poorly when the goal is to understand a field landscape rather than read a specific paper. Existing tools either surface papers without analysis (arXiv search), summarise individual papers without synthesis (basic summarisation tools), or are paywalled (Elsevier, Springer tools).

### 1.2 Goals

1. Accept a topic, PDF, URL, or raw text as input.
2. Retrieve the most relevant academic papers from four open-access sources automatically.
3. Analyse each paper with an LLM using an evidence-grounded reasoning protocol — not generic summarisation.
4. Synthesise cross-paper insights (common themes, disagreements, recurring limitations, research trends).
5. Generate a formal 8-section academic literature review on demand.
6. Persist all sessions as workspaces so the user can revisit prior research.
7. Run entirely from `python app.py` — no external infrastructure.

### 1.3 Non-Goals

- Real-time paper indexing (the system queries live external APIs, not a local index).
- Full PDF text retrieval (the system analyzes abstracts for topic search; full text only for uploaded PDFs).
- Authentication or multi-user support.
- Citation management or BibTeX export.
- Mobile-responsive design (desktop first).
- Database-backed storage (file system only for this version).

---

## 2. Constraints

| Constraint | Impact |
|---|---|
| Free-tier APIs only | arXiv, Semantic Scholar, OpenAlex, PubMed all have rate limits. PubMed: 3 req/sec without API key (enforced via `time.sleep(0.35)` between esearch and efetch). |
| Single GEMINI_API_KEY | All LLM calls share one key. Burst analysis of many papers can exhaust per-minute token quota. |
| No database | All storage is JSON files; no querying, no indexing, no concurrent write safety. |
| File-based PDF storage | Uploaded PDFs are stored verbatim in `uploads/`; no size limit enforced. |
| Python stdlib HTTP | All external API calls use `urllib` (no `requests` dependency) for minimal dependencies. |
| PyMuPDF Python 3.14 incompatibility | `pymupdf==1.23.8` has a `_struct.error` on Python 3.14. Falls back silently to `pdfminer.six`. |
| Gemini context window | `analyze_paper_prompt` truncates text to 7000 characters; `multi_paper_analysis_prompt` to 10000 characters; `literature_review_prompt` to 9000 characters. Papers with very long text are truncated. |

---

## 3. LLM Integration Design

### 3.1 Model Choice

**Model:** `gemini-2.5-flash`

**Generation parameters:**
- `temperature = 0.2` — Low temperature for deterministic, factual extraction. Research analysis benefits from consistency over creativity.
- `top_p = 0.9` — Nucleus sampling retains diversity within high-probability tokens, preventing degenerate outputs.
- `max_output_tokens = 4096` — Sufficient for the longest expected JSON outputs (full paper analysis, multi-paper synthesis).

**Rationale for Flash over Pro:** The application makes many LLM calls per request (1 topic expansion + 1 relevance scoring + N paper analyses + 1 multi-paper synthesis = N+3 calls, reduced from N+4 via the combined prompt). Flash's higher throughput and lower cost per token make it practical for this call volume. The structured prompt engineering compensates for Flash's lower raw capability versus Pro.

**Single combined prompt:** `paper_combined_prompt` replaces the old two-stage understand+analyze pipeline with a single call that returns the `_understanding` sub-object alongside all analysis fields. This halves LLM calls per paper and reduces total request latency on the free tier.

### 3.2 Configuration Pattern

```python
# llm.py
_configured = False

def _configure():
    global _configured
    if _configured:
        return
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY not set.")
    genai.configure(api_key=api_key)
    _configured = True
```

Configuration is lazy (first call only) and guarded by a module-level boolean to avoid repeated `genai.configure()` calls within a single process. The API key is read from environment (loaded from `.env` via `python-dotenv` in `app.py` at startup).

### 3.3 JSON Extraction Strategy

Gemini sometimes wraps JSON in markdown fences (` ```json ... ``` `) or includes explanatory text before or after the JSON block. `call_llm` implements two-level extraction:

```
Level 1: Strip markdown fences
  cleaned = re.sub(r"^```(?:json)?\s*", "", text)
  cleaned = re.sub(r"\s*```$", "", cleaned).strip()
  → try json.loads(cleaned)

Level 2: Regex search for JSON block
  → on JSONDecodeError:
  match = re.search(r"[\[{].*[\]}]", cleaned, re.DOTALL)
  if match:
      → try json.loads(match.group())

Level 3: Raise ValueError (caller invokes fallback)
```

This handles:
- Clean JSON responses (most common case).
- Fenced JSON with ` ```json ` (common when model defaults to markdown mode).
- JSON embedded in explanatory prose (less common; regex extracts the first `{...}` or `[...]` block).

### 3.4 Chain-of-Thought Reasoning Protocol

The single-paper analysis prompt (`analyze_paper_prompt`) embeds a 10-step internal reasoning protocol that the model must work through before generating any output field. The questions are:

```
1.  What specific problem does this paper address? Why does it matter?
2.  What gap in prior work motivates this paper? Is it stated or implied?
3.  What is the core methodological contribution? What makes it novel?
4.  What datasets were used? Are they standard benchmarks or custom?
5.  How is performance evaluated? What metrics? Compared against what baselines?
6.  What do the results actually show? Are the improvements significant?
7.  What does the paper itself admit it cannot do or does poorly?
8.  What would a rigorous peer reviewer criticize?
9.  What future work do the authors explicitly suggest?
10. What future work is implied by the gaps and limitations but NOT stated by the authors?
```

The multi-paper synthesis prompt (`multi_paper_analysis_prompt`) similarly embeds an 8-step synthesis protocol focused on cross-paper comparison:

```
1. What methodological families appear across papers? Which dominates? Why?
2. Which datasets appear repeatedly? Which papers use unique datasets — why?
3. Where do evaluation protocols differ? What does inconsistency mean?
4. Where do papers agree? Where do they contradict each other?
5. What problem does EVERY paper struggle with (recurring limitation)?
6. What gap does NO paper address — not even partially?
7. What is the field trajectory: what has improved, what is stagnating?
8. What would a meta-reviewer conclude about the maturity of this area?
```

**Design intent:** By forcing the model to reason through these questions internally before producing structured output, the protocol produces analysis grounded in specific paper evidence rather than generic academic boilerplate. The `RULES` section at the end of each prompt reinforces this by explicitly prohibiting generic statements.

### 3.5 Prompt Chain for Topic Search

```
Request: "transformer attention mechanisms in vision"
     │
     ▼
[Call 1] topic_expansion_prompt
     → canonical_topic: "Vision Transformer Attention Mechanisms"
     → domain: "computer_science"
     → is_medical: false
     → arxiv_categories: ["cs.CV", "cs.LG", "cs.AI"]
     → search_queries: [5 query variants]
     → relevance_concepts: [6 core concepts]
     → rejection_signals: [3 off-topic signals]
     │
     ▼ (concurrent, max_workers=4)
[arXiv / S2 / OpenAlex searches run in parallel]
     │
     ▼
[Call 2] relevance_scoring_prompt (batch — all papers at once)
     → [{index: 0, score: 87, reason: "..."}, ...]
     │
     ▼ (sequential, one call per paper)
[Call 3..N+2] analyze_paper_prompt per paper
     → structured analysis per paper
     │
     ▼
[Call N+3] multi_paper_analysis_prompt
     → cross-paper synthesis
```

Total LLM calls for a 10-paper topic search: **13** (1 expansion + 1 relevance + 10 analyses + 1 synthesis).

---

## 4. Retrieval Pipeline Design

### 4.1 Four-Source Architecture

| Source | Protocol | Authentication | Strengths | Limitations |
|---|---|---|---|---|
| arXiv | Atom XML REST API | None | Preprint coverage, CS/Physics/Math/Bio, arXiv IDs | No citation counts, CS-biased |
| Semantic Scholar | JSON REST API | None (rate-limited) | Citation counts, open-access PDF links, cross-domain | 500 req/day unauthenticated; occasionally slow |
| OpenAlex | JSON REST API | None (polite pool) | Broad cross-disciplinary, DOIs, citation counts, inverted-index abstracts | Abstract quality varies; inverted index reconstruction |
| PubMed | NCBI E-utilities XML | None (3 req/sec limit) | Medical/biological domain authority | Medical topics only; no citation counts; structured abstract format |

### 4.2 Concurrency Design

```python
with ThreadPoolExecutor(max_workers=4) as executor:
    futures = {executor.submit(fn): name for name, fn in sources.items()}
    for future in as_completed(futures):
        name = futures[future]
        papers = future.result()
        all_papers.extend(papers)
```

Each source function (`run_arxiv`, `run_semantic_scholar`, `run_openalex`, `run_pubmed`) itself runs multiple query variants sequentially within its thread. The outer `as_completed` loop collects results as they arrive — faster sources don't wait for slower ones.

`run_pubmed` returns `[]` immediately when `is_medical=False`, costing no network time for non-medical topics.

**Fetch multiplier:** `fetch_per_source = max(max_results * 3, 20)`. For `max_results=5`, each source fetches up to 15 papers per query; for `max_results=10`, up to 30. This ensures the ranking and deduplication pipeline has a sufficient candidate pool to select the best papers.

### 4.3 Query Distribution

| Source | Queries Used | Reason |
|---|---|---|
| arXiv | `queries[:3]` (top 3) | Category filter means precision is high; fewer queries needed |
| Semantic Scholar | `queries[:4]` (top 4) | Broad corpus, higher recall benefit from more queries |
| OpenAlex | `queries[:3]` (top 3) | Cross-disciplinary; middle ground |
| PubMed | `queries[:3]` (top 3) | Medical domain; 3 query variants cover clinical and basic-science angles |

### 4.4 Relevance Scoring Formula

```
composite = 0.50 × semantic + 0.25 × citation + 0.15 × recency + 0.10 × source
```

**Semantic score (weight 0.50):** LLM batch-scores each paper 0-100 based on how well its title and abstract address the topic's `relevance_concepts` and avoid `rejection_signals`. This is the dominant signal because keyword overlap is insufficient for determining true relevance — a paper on "attention" might be about cognitive psychology, not neural networks.

**Citation score (weight 0.25):** Log-normalised citation count: `log1p(N) / log1p(max_N) × 100`. Log normalisation prevents a single highly-cited paper from dominating. Papers with 0 citations receive a neutral 50.0 when all papers have 0 citations (arXiv preprints frequently have no citation data).

**Recency score (weight 0.15):** Age-based piecewise linear decay:

```
age ≤ 3 years:   100.0
age 4-5 years:   100.0 - (age - 3) × 20.0   → range [60, 100]
age 6-10 years:  60.0 - (age - 5) × 6.0     → range [30, 60]
age > 10 years:  max(10.0, 30.0 - (age - 10) × 2.0)
unknown year:    50.0 (neutral)
```

Papers within 3 years receive maximum recency credit. The decay is intentionally lenient (seminal older papers score 30+ even at 10 years old) to avoid excluding foundational work.

**Source score (weight 0.10):** PubMed=90 (peer-reviewed medical literature), Semantic Scholar=75 (curated academic corpus), OpenAlex=70 (broad academic), arXiv=60 (preprints, not peer-reviewed). This small weight nudges peer-reviewed sources above preprints when all else is equal. Multi-source papers take the maximum.

**Threshold:** Papers with composite score < 20 are dropped. This removes papers that the LLM marked as irrelevant (semantic score near 0) and have few citations and are old — a combination indicating true irrelevance.

---

## 5. Deduplication Algorithm

Papers appear across multiple sources (a Semantic Scholar paper may also be on arXiv; an OpenAlex record may share a DOI with Semantic Scholar). The three-level deduplication runs in a single pass over all papers in insertion order.

### 5.1 Level 1: arXiv ID

```python
if arxiv_id and arxiv_id in seen_arxiv:
    dup_idx = seen_arxiv[arxiv_id]
```

`_arxiv_id` is extracted from the arXiv canonical URL (e.g., `2310.01848` from `https://arxiv.org/abs/2310.01848`). Semantic Scholar records include `externalIds.ArXiv`; OpenAlex does not populate `_arxiv_id`. Most CS paper duplicates are caught at this level.

### 5.2 Level 2: DOI

```python
doi = (paper.get("_doi") or "").strip().lower()
if doi and doi in seen_doi:
    dup_idx = seen_doi[doi]
```

DOIs are normalised to lowercase (DOIs are case-insensitive). Semantic Scholar and OpenAlex both populate `_doi`. PubMed does not populate `_doi` in the current implementation. Catches medical and interdisciplinary duplicates not covered by arXiv ID.

### 5.3 Level 3: Normalised Title

```python
def _norm_title(t: str) -> str:
    return re.sub(r"[^a-z0-9]", "", t.lower())

if norm and norm in seen_title:
    dup_idx = seen_title[norm]
```

All characters except ASCII letters and digits are removed, and the string is lowercased. This handles minor title variants: trailing punctuation, spacing differences, Unicode dash vs. hyphen. A paper titled "BERT: Pre-training of Deep Bidirectional Transformers" normalises to `bertpretrainingofdeepbidirectionaltransformers`, which matches the same title regardless of minor variations in how different sources format it.

**Limitation:** This is exact-match on the normalised string, not fuzzy matching. Two papers with slightly different titles (e.g., one truncated by a source API) will not be detected as duplicates. A future improvement would use edit-distance or min-hash similarity.

### 5.4 Merge Strategy

When a duplicate is found, the existing entry at `unique[dup_idx]` is replaced with a merged version:

1. `citations` = `max(existing, candidate)` — takes the higher count (Semantic Scholar may have the count while arXiv has 0).
2. `abstract` = whichever is longer — prefers more complete text.
3. `url` = existing if non-empty, else candidate — preserves a valid link.
4. `source` = comma-joined sorted set: `"OpenAlex, Semantic Scholar"` — preserves multi-source provenance.

---

## 6. Dual Output Schema Rationale

### 6.1 The Two Schema Layers

Every analysis result from `analyze_text()` contains two overlapping layers of keys:

**Structured layer (20+ keys, added in v2):**
```
executive_summary        research_problem      motivation
research_gap             main_contribution     field_maturity_assessment
methodology {overview, key_components[], novelty}
datasets [{name, type, size, domain}]
evaluation {metrics[], baselines[], protocol}
results_and_findings[]   strengths[]           weaknesses[]
limitations[]
research_gaps {from_limitations[], from_missing_datasets[],
               from_missing_benchmarks[], from_generalization[],
               from_deployment[], from_unsolved_problems[]}
future_scope {author_suggested[], ai_generated[]}
key_takeaways[]
keywords [{term, score}]
stats {word_count, sentence_count, avg_sentence_length, unique_words}
```

**Legacy flat layer (added as `setdefault` calls, backward-compatible):**
```
summary                  (= executive_summary)
important_sentences      (= key_takeaways)
contributions            (= [main_contribution])
methods                  (= [methodology.overview])
evaluation_metrics       (= evaluation.metrics)
research_gaps_flat       (= flattened research_gaps dict)
future_scope_flat        (= author_suggested + ai_generated)
```

### 6.2 Rationale

The `ResultsPage.jsx` `SingleAnalysis` component was written to consume flat arrays (`data.research_gaps`, `data.future_scope`, `data.methods`). The structured schema added sub-keys that are more semantically precise but would require component rewrites to consume.

The `setdefault` approach in `analyze_text()` ensures:
1. New structured fields are always present for features that consume them (future tab-based UI, literature review generation).
2. Existing UI components that iterate `data.research_gaps` as a flat array continue working without modification.
3. If the same analysis dict is passed to both old and new consumers, both get the keys they expect.

The `research_gaps_flat` and `future_scope_flat` keys explicitly materialise the flattening operation so consumers do not have to implement their own flattening logic.

---

## 7. Frontend State Machine

The `view` state in `App.jsx` controls which top-level page renders. The transitions are:

```
                    ┌──────────────────────────────────────────┐
                    │                                          │
                    ▼                                          │
               ┌─────────┐    submit (InputPage)              │
    ─────────→ │  "home"  │─────────────────────────────→ ┌──────────┐
               └─────────┘                                │"results" │
                    ▲                                      └──────────┘
                    │   ← New Search / handleNew()              │
                    │                                           │
                    │   ← Literature → onBack()                 │
                    │                                           │
               ┌──────────────┐                               │
               │ "literature" │ ←─── handleLiteratureHome() ──┘
               └──────────────┘
                    ▲
                    │  ← onLiteratureHome() from Sidebar
                    │
                    │
               [Any view]
```

**Mode state** (`"topic" | "pdf" | "url" | "text"`) is set by the user clicking tabs in `InputPage` and is read by `ResultsPage` to determine rendering strategy (`isTopic`, `isMultiPDF`, `isMulti`). Mode persists across view changes (returning to `home` after results preserves the last selected mode).

**Workspace loading path** (Sidebar click): `handleSelectWorkspace` reads `ws.metadata.mode` from the workspace API response and reconstructs the `results` object in the shape that `ResultsPage` expects for that mode — this avoids storing the full analysis response in `metadata.json`.

---

## 8. Security Considerations

### 8.1 API Key Management

- `GEMINI_API_KEY` is stored in a `.env` file at the project root and loaded at startup via `python-dotenv`.
- The `.gitignore` (from the initial commit) must exclude `.env`. The key is never exposed to the frontend — all Gemini calls originate in the Python backend.
- The `/health` endpoint exposes `api_key_configured: bool` (not the key value itself) for diagnostics.

### 8.2 Input Validation

- All text inputs are stripped and validated for non-emptiness before processing.
- File uploads are validated to ensure at least one file is present and text can be extracted.
- The `analyze/topic` route caps `max_papers` to user-supplied values but applies no server-side maximum — a request with `max_papers=1000` would trigger excessive API calls. A hardcoded cap (e.g., 20) should be added for production deployment.

### 8.3 URL Fetching

- `extract_from_url` uses `urllib.request.urlopen` with a 15-second timeout. There is no SSRF (Server-Side Request Forgery) protection — a malicious URL could cause the server to make requests to internal network addresses. For a local development tool this is acceptable; for a publicly-accessible deployment, URL input should be restricted to known domains or validated against a allowlist.

### 8.4 File Storage

- Uploaded PDFs are written to `uploads/` within the workspace directory without sanitising the filename. A malicious filename such as `../../etc/passwd` could path-traverse. `os.path.join` with a validated base directory (as currently implemented) mitigates this on POSIX systems, but the filename should be sanitised (e.g., `werkzeug.utils.secure_filename`) for production.

### 8.5 No Authentication

There is no authentication, session management, or user isolation. Any user with access to the Flask port (default 5000) can read, delete, or create any workspace. This is by design for a single-user local development tool but is a critical gap for multi-user or publicly-accessible deployments.

### 8.6 CORS Configuration

`flask-cors` with `CORS(app)` in development allows all origins. In production (where Flask serves the React frontend from the same origin), CORS is not needed and this configuration should be removed or restricted to a specific origin.

---

## 9. Known Limitations

### 9.1 PyMuPDF / Python 3.14 Incompatibility

`pymupdf==1.23.8` ships a compiled C extension (`_fitz.pyd`) that uses Python's `struct` module with a format string that changed behaviour in Python 3.14. Symptom: `_struct.error: unpack requires a buffer of 2 bytes` when calling `fitz.open()`. The `except Exception` handler in `extract_from_pdf` catches this and falls through to `pdfminer.six`. The workaround is functional but `pdfminer.six` is slower and produces lower quality text from complex PDFs. Upgrading to PyMuPDF ≥ 1.24.x (which ships Python 3.14-compatible binaries) resolves this.

### 9.2 No Authentication or Multi-User Support

All workspaces are visible to any process/user with access to the server port. The workspace IDs are 8-character UUID fragments — collision probability is low but non-zero at scale. Appropriate for local single-user use only.

### 9.3 File-Based Storage Scalability

- Each workspace write (`save_papers`, `save_analyses`) reads the full JSON file and rewrites it entirely. For large workspaces (many papers with long analyses), this is slow.
- `list_workspaces()` iterates every directory under `BASE_DIR` on every sidebar refresh. With hundreds of workspaces, this becomes measurably slow.
- No concurrent write safety — simultaneous requests to the same workspace endpoint could corrupt JSON files.
- Workspace data accumulates indefinitely; there is no TTL or cleanup mechanism.

### 9.4 Gemini Rate Limits and Token Budget

A single 10-paper topic search makes approximately 13 Gemini API calls and consumes approximately 50,000-100,000 input tokens (topic expansion + relevance scoring + 10 paper analyses + synthesis). This can approach or exceed free-tier rate limits (15 RPM, 1M TPM for `gemini-1.5-flash` free tier) if multiple searches are run in quick succession. The current implementation has no retry logic, backoff, or token budgeting.

### 9.5 Abstract-Only Analysis for Topic Search

For topic search mode, `analyze_text` receives only `paper['abstract']` — typically 150-250 words. The analysis quality is therefore limited compared to full-text analysis. The `analyze_paper_prompt` is designed for full paper text (up to 7000 characters) and produces more reliable results when given the complete introduction, methods, and results sections. Full-text retrieval would require downloading and extracting PDFs from the retrieved paper URLs.

### 9.6 PubMed Citation Count Gap

PubMed's NCBI E-utilities do not return citation counts. Papers retrieved exclusively from PubMed receive `citations=0`, which artificially depresses their citation score component in the composite relevance formula. The source score (PubMed=90) partially compensates, but highly-cited medical papers may rank lower than equivalent arXiv preprints if their citation count is not sourced from Semantic Scholar.

### 9.7 OpenAlex Abstract Reconstruction

OpenAlex stores abstracts as inverted indices. The `_reconstruct_abstract` function sorts words by their position to reconstruct the text. This reconstruction is exact for the stored word sequence but loses any formatting (line breaks, mathematical notation) present in the original abstract.

### 9.8 No Streaming

All LLM responses are collected in full before being returned. For long syntheses or literature reviews, the user waits without feedback for 15-30 seconds. Implementing streaming via Server-Sent Events or WebSockets would improve perceived responsiveness.
