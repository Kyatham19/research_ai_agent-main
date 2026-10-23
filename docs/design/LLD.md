# Low-Level Design (LLD) — Research AI Agent

## 1. Backend Module: `app.py`

### 1.1 Module Overview

`app.py` is the Flask application entry point. It initialises the Flask app with `static_folder='../frontend/dist'`, enables CORS, imports all domain modules, and registers routes. It does not contain business logic — it delegates entirely to `extractors.py`, `analyzer.py`, `literature_review.py`, and `storage.py`.

### 1.2 Flask Application Init

```python
app = Flask(__name__, static_folder='../frontend/dist', static_url_path='')
CORS(app)
```

- `static_url_path=''` mounts the static folder at the root path `/`.
- `.env` is loaded at module level via `load_dotenv()` before any routes run.

### 1.3 Routes

#### `GET /`
```python
def serve() -> Response
```
- **Purpose:** Serve the React SPA entry point.
- **Returns:** `index.html` from `../frontend/dist/`.
- **Error behaviour:** Flask raises 404 if `dist/` has not been built.

#### `GET /<path:path>`
```python
def static_files(path: str) -> Response
```
- **Purpose:** Serve bundled JS/CSS assets; fall back to `index.html` for any path that does not correspond to a physical file (SPA client-side routing).
- **Logic:** `os.path.exists(full_path)` — if true, serve the file; otherwise serve `index.html`.
- **Error behaviour:** Only fails if `dist/` is absent entirely.

#### `GET /health`
```python
def health() -> JSON
```
- **Returns:** `{"status": "ok", "llm": "gemini-2.5-flash", "api_key_configured": bool}`
- **Purpose:** Health check; `api_key_configured` reflects whether `GEMINI_API_KEY` is non-empty in environment.

#### `GET /api/workspaces`
```python
def get_workspaces() -> JSON
```
- **Returns:** JSON array of workspace metadata dicts, sorted by `last_opened` descending.
- **Delegates to:** `storage.list_workspaces()`
- **Error behaviour:** Returns empty array `[]` if data directory does not exist.

#### `POST /api/workspaces`
```python
def create_new_workspace() -> JSON, 201
```
- **Input:** `{"query": str}` — query defaults to `"Untitled"` if absent.
- **Returns:** Full metadata dict with HTTP 201.
- **Delegates to:** `storage.create_workspace(query)`

#### `GET /api/workspaces/<wid>`
```python
def get_workspace(wid: str) -> JSON
```
- **Input:** `wid` — 8-character workspace UUID fragment.
- **Side effect:** Calls `update_last_opened(wid)` before loading.
- **Returns:** `{metadata, papers, analyses, ideas, chat}`
- **Error behaviour:** Returns `{"error": "Not found"}` with HTTP 404 if workspace directory is absent.

#### `DELETE /api/workspaces/<wid>`
```python
def remove_workspace(wid: str) -> JSON
```
- **Returns:** `{"deleted": true}` on success, `{"error": "Not found"}` with HTTP 404 if absent.
- **Delegates to:** `storage.delete_workspace(wid)` which calls `shutil.rmtree`.

#### `POST /api/favorite/<wid>`
```python
def favorite_workspace(wid: str) -> JSON
```
- **Returns:** `{"favorite": bool}` — the new value after toggle.
- **Delegates to:** `storage.toggle_favorite(wid)`

#### `POST /api/workspaces/<wid>/chat`
```python
def add_chat(wid: str) -> JSON, 201
```
- **Input:** `{"role": "user"|"assistant", "content": str}`
- **Validation:** Returns HTTP 400 if content is empty after strip.
- **Returns:** The saved message dict `{id, role, content, timestamp}` with HTTP 201.
- **Delegates to:** `storage.save_chat_message(wid, role, content)`

#### `POST /api/literature-review`
```python
def literature_review() -> JSON
```
- **Input:** `{"papers": list, "topic": str, "workspace_id": str|null}`
- **Validation:** Returns HTTP 400 if fewer than 2 papers provided.
- **Returns:** Full literature review dict (8 sections + summary table + metadata arrays).
- **Delegates to:** `generate_literature_review(papers, topic)`
- **Error behaviour:** LLM failures are caught inside `generate_literature_review`; fallback result always returned.

#### `POST /analyze/text`
```python
def analyze_raw_text() -> JSON
```
- **Input:** `{"text": str}`
- **Validation:** HTTP 400 if text is empty after strip.
- **Returns:** Full analysis dict.
- **Delegates to:** `analyze_text(text)`

#### `POST /analyze/pdf`
```python
def analyze_pdf() -> JSON
```
- **Input:** multipart/form-data with `file` (PDF) and optional `workspace_id`.
- **Validation:** HTTP 400 if no file in request, or if `extract_from_pdf` returns None.
- **Side effects (when workspace_id provided):** calls `save_uploaded_file`, `save_analyses`, `update_metadata` (sets `mode="pdf"`).
- **Returns:** Analysis dict with `source=filename` added.
- **Error behaviour:** PDF extraction failure returns HTTP 400.

#### `POST /analyze/pdfs`
```python
def analyze_multiple_pdfs() -> JSON
```
- **Input:** multipart/form-data with `files` list and optional `workspace_id`.
- **Logic:** Iterates files, extracts text, calls `analyze_text` per file. Concatenates all texts and calls `analyze_text(all_text)` for combined analysis when more than one file succeeds. If exactly one file succeeds, that analysis is the combined result.
- **Returns:** `{"papers": list, "combined": dict, "paper_count": int}`
- **Error behaviour:** HTTP 400 if no file yields extractable text.

#### `POST /analyze/url`
```python
def analyze_url() -> JSON
```
- **Input:** `{"url": str, "workspace_id": str|null}`
- **Validation:** HTTP 400 if URL empty or extraction returns None.
- **Side effects (when workspace_id provided):** `save_analyses`, `update_metadata` (sets `mode="url"`).
- **Returns:** Analysis dict with `source=url`.

#### `POST /analyze/topic`
```python
def analyze_topic() -> JSON
```
- **Input:** `{"topic": str, "max_papers": int (default 10), "workspace_id": str|null}`
- **Validation:** HTTP 400 if topic empty; HTTP 404 if search returns no papers.
- **Logic:**
  1. `search_papers(topic, max_results=max_papers)` — full retrieval pipeline.
  2. `analyze_text(paper['abstract'])` for each paper; result augmented with paper metadata fields.
  3. `call_llm(multi_paper_analysis_prompt(...))` for combined cross-paper synthesis.
  4. Fallback: `_merge_analyses(results, topic)` if multi-paper LLM call fails.
  5. `save_papers`, `save_analyses`, `update_metadata` if workspace_id provided.
- **Returns:** `{topic, paper_count, individual_papers, combined_analysis, workspace_id}`

#### Private: `_merge_analyses(results, topic)`
```python
def _merge_analyses(results: list, topic: str) -> dict
```
- **Purpose:** Fallback combined analysis built entirely from individual paper analysis results without a second LLM call.
- **Logic:** Deduplicates and merges all list fields (`research_gaps`, `limitations`, `future_scope`, `contributions`, `methods`, `keywords`) using a seen-set on the first 60 characters of each item. Truncates to reasonable per-field limits. Calls `compute_stats` on concatenated abstracts.
- **Returns:** Combined dict with merged fields and a `title = "Combined: {topic}"`.

---

## 2. Backend Module: `llm.py`

### 2.1 Module Overview

`llm.py` encapsulates all Gemini API interactions. It provides one API wrapper function (`call_llm`) and five prompt builder functions. Configuration is lazy (first call only). No module-level network calls.

### 2.2 Functions

#### `_configure()`
```python
def _configure() -> None
```
- **Purpose:** Configure the `google-generativeai` SDK with the API key. Called at most once per process (guarded by `_configured` module-level flag).
- **Error behaviour:** Raises `EnvironmentError` if `GEMINI_API_KEY` is not set.

#### `_get_model(large_output=False)`
```python
def _get_model(large_output: bool = False) -> genai.GenerativeModel
```
- **Purpose:** Return a configured `GenerativeModel` instance for `gemini-2.5-flash`.
- **Configuration:** `temperature=0.2`, `top_p=0.9`, `max_output_tokens=8192` when `large_output=True`, else `4096`.
- **Note:** Each call constructs a new model object (lightweight; Gemini SDK does not pool model objects).

#### `call_llm(prompt, expect_json=True, max_retries=3, large_output=False)`
```python
def call_llm(prompt: str, expect_json: bool = True, max_retries: int = 3, large_output: bool = False) -> dict | list | str
```
- **Purpose:** Send a prompt to Gemini and return the parsed result.
- **Inputs:** `prompt` — the full prompt string. `expect_json` — if `True`, parse response as JSON. `max_retries` — number of retry attempts on rate-limit errors. `large_output` — if `True`, uses 8192 token limit.
- **JSON extraction strategy (two levels):**
  1. Strip leading ` ```json ` and trailing ` ``` ` fences with regex.
  2. Try `json.loads(cleaned)`.
  3. On `JSONDecodeError`: regex-search for the first `{...}` or `[...]` substring and try `json.loads` on that.
  4. If both fail: raise `ValueError` with the first 300 characters of the raw response for debugging.
- **Rate limit handling:** On `429` / quota errors, reads the API-suggested `retry_delay` from the error message (minimum 30s), waits, then retries. After all retries exhausted, raises `RuntimeError("RATE_LIMIT: ...")`.
- **When `expect_json=False`:** Returns raw `response.text.strip()` as a string.
- **Error behaviour:** `ValueError` propagates to caller; all callers catch it and invoke their fallback.

#### `topic_expansion_prompt(topic)`
```python
def topic_expansion_prompt(topic: str) -> str
```
- **Purpose:** Build the prompt that asks Gemini to analyse a user-supplied research topic and return a structured search plan.
- **Returns:** Prompt string requesting a JSON object with keys: `canonical_topic`, `domain`, `is_medical`, `arxiv_categories`, `search_queries` (list of 5), `relevance_concepts` (list of 6), `rejection_signals` (list of 3).
- **Prompt style:** Role-primed as "research librarian and academic search specialist". Rules section enforces that `search_queries` are natural academic English phrases and `arxiv_categories` are real valid codes.

#### `relevance_scoring_prompt(papers_json, relevance_concepts, rejection_signals, canonical_topic)`
```python
def relevance_scoring_prompt(
    papers_json: str,
    relevance_concepts: list,
    rejection_signals: list,
    canonical_topic: str
) -> str
```
- **Purpose:** Build the prompt that asks Gemini to score each paper 0-100 for relevance.
- **Inputs:** `papers_json` — compact JSON with `{index, title, abstract[:400]}` per paper. Lists of concepts and rejection signals.
- **Scoring guide embedded in prompt:** 90-100 (directly on topic), 70-89 (closely related), 50-69 (tangential), 20-49 (partial overlap), 0-19 (not relevant).
- **Returns:** Prompt requesting a JSON array `[{index, score, reason}]`.

#### `paper_combined_prompt(text)`
```python
def paper_combined_prompt(text: str) -> str
```
- **Purpose:** Single combined prompt that replaces the old two-stage understand+analyze pipeline. Halves LLM calls per paper (1 call instead of 2).
- **Inputs:** `text` — paper text. Sampled to first 4000 + last 3000 chars if longer than 7000 characters.
- **Output schema requested:** All 20+ analysis fields plus a `_understanding` sub-object embedded in the same JSON response. The caller extracts `_understanding` and retains it for debugging; the rest is the standard analysis object.
- **Chain-of-thought protocol:** Embedded reasoning questions force the model to understand the paper before extracting structured fields.

#### `multi_paper_analysis_prompt(papers_text, topic)`
```python
def multi_paper_analysis_prompt(papers_text: str, topic: str) -> str
```
- **Purpose:** Build the cross-paper synthesis prompt.
- **Inputs:** `papers_text` — structured text blocks (title, authors, year, source, summary, contributions, methods, gaps, limitations, future) for each paper, truncated to 10000 characters. `topic` — the search topic.
- **Synthesis protocol:** 8 questions embedded that force comparison across papers (methodological families, recurring datasets, evaluation inconsistencies, areas of agreement/disagreement, recurring limitations, field maturity).
- **Output schema:** `synthesis_summary`, `common_themes[{theme, description, papers_involved, significance}]`, `method_comparison{summary, approaches[], dominant_approach}`, `dataset_comparison{summary, datasets[], coverage_gaps[]}`, `evaluation_comparison{consistent_metrics[], inconsistent_metrics[], missing_evaluations[], benchmark_gaps[]}`, `areas_of_agreement[]`, `areas_of_disagreement[{point, paper_a, paper_b, implication}]`, `research_trends[{trend, evidence, trajectory}]`, `recurring_limitations[{limitation, appears_in[], impact}]`, `recurring_research_gaps[{gap, evidence, priority}]`, `future_research_opportunities[{opportunity, rationale, novelty}]`, `field_maturity_assessment`, `keywords[]`, `datasets[]`, `evaluation_metrics[]`, `methods[]`.

#### `literature_review_prompt(papers_json, topic)`
```python
def literature_review_prompt(papers_json: str, topic: str) -> str
```
- **Purpose:** Build the formal academic literature review prompt.
- **Inputs:** `papers_json` — structured JSON of paper data including pre-computed analysis fields, truncated to 9000 characters.
- **Writing protocol:** Four directives: each section must advance an argument; cite papers by author/year inline; identify tensions across the field; must be useful to a researcher understanding the field landscape.
- **Output schema:** Eight HTML-content fields (`introduction`, `background`, `thematic_analysis`, `methodology_comparison`, `dataset_comparison`, `research_trends`, `conclusion_and_gaps`, `conclusion`), plus `themes[]`, `common_gaps[]`, `common_limitations[]`, `future_suggestions[]`, and `summary_table[{title, authors, research_problem, contribution, methodology, datasets, key_results, limitations, url}]`.
- **Note:** The eight section values contain embedded HTML (`<h2>`, `<h3>`, `<p>`, `<ul>`, `<li>` tags) rendered by the frontend using `dangerouslySetInnerHTML`.

---

## 3. Backend Module: `extractors.py`

### 3.1 Module Overview

`extractors.py` implements the full paper retrieval pipeline plus PDF and URL content extraction utilities. Constants: `RELEVANCE_THRESHOLD = 20`, `CURRENT_YEAR = datetime.now().year`. HTTP headers include a realistic `User-Agent` string to avoid bot-blocking.

### 3.2 Functions

#### `expand_topic(topic)`
```python
def expand_topic(topic: str) -> dict
```
- **Purpose:** LLM-based topic understanding. Calls `call_llm(topic_expansion_prompt(topic))`.
- **Validation:** Checks all 7 required keys are present and non-empty after parsing.
- **Error behaviour:** On any exception, falls back to a safe default dict: `canonical_topic=topic`, `domain="other"`, `is_medical=_is_medical_fallback(topic)`, `arxiv_categories=["cs.LG","cs.AI"]`, `search_queries=[topic]`, `relevance_concepts=[topic]`, `rejection_signals=[]`.

#### `_is_medical_fallback(topic)`
```python
def _is_medical_fallback(topic: str) -> bool
```
- **Purpose:** Keyword-based medical domain detection used only when LLM expansion fails.
- **Keywords checked:** disease, clinical, medical, patient, diagnosis, retinal, diabetic, cancer, tumor, cardiac, brain, drug, therapy, treatment, hospital, mri, ct scan, pathology, radiology, ophthalmology, oncology, cardiology, dermatology, fundus, lesion, segmentation, biomarker, genomic, protein.

#### `search_papers(topic, max_results=10)`
```python
def search_papers(topic: str, max_results: int = 10) -> list
```
- **Purpose:** Main entry point for the retrieval pipeline. Runs all 5 steps (expand, search, merge, score, rank) and returns top N papers.
- **Fetch multiplier:** `fetch_per_source = max(max_results * 3, 20)` — fetches significantly more than needed so scoring can select the best.
- **Fallback:** If all sources return empty, calls `_mock_papers(topic, max_results)` returning up to 3 labelled `[DEMO]` papers.
- **Returns:** List of paper dicts with all metadata fields plus `relevance_score`, `semantic_score`, `citation_score`, `recency_score`, `source_score`.
- **Alias:** `search_arxiv(topic, max_results)` is defined as a backward-compatible alias.

#### `_search_arxiv_api(query, max_results, categories)`
```python
def _search_arxiv_api(query: str, max_results: int, categories: list = None) -> list
```
- **Protocol:** Calls `https://export.arxiv.org/api/query` with Atom XML format.
- **URL construction:** `search_query=(ti:{q}+OR+abs:{q})+AND+(cat:cs.LG+OR+cat:cs.AI+...)`. Falls back to `cat:cs.*` if no categories provided. Requests `max_results * 2` to allow for abstract-too-short filtering.
- **Parsing:** `xml.etree.ElementTree` with `atom:` namespace prefix. Extracts `title`, `summary` (abstract), `author/name` list (≤6), `published` date, `id` (arXiv URL from which `_arxiv_id` is extracted via regex).
- **Filtering:** Skips entries with abstracts shorter than 50 characters.
- **Returns:** List of paper dicts with `source="arXiv"`, `citations=0` (arXiv does not provide citation counts), `_arxiv_id`, `_doi=""`.
- **Error behaviour:** Any exception returns empty list and logs error.

#### `_search_semantic_scholar(query, max_results)`
```python
def _search_semantic_scholar(query: str, max_results: int) -> list
```
- **Protocol:** Calls `https://api.semanticscholar.org/graph/v1/paper/search` with JSON response. Fields requested: `title,abstract,authors,year,externalIds,citationCount,venue,openAccessPdf,fieldsOfStudy`.
- **URL resolution priority:** `openAccessPdf.url` > `https://arxiv.org/abs/{arxivId}` > `https://doi.org/{doi}` > `https://pubmed.ncbi.nlm.nih.gov/{pmid}/` > empty string.
- **Extracts:** `_arxiv_id` from `externalIds.ArXiv`, `_doi` from `externalIds.DOI`, `citations` from `citationCount`.
- **Filtering:** Skips papers with abstract shorter than 50 characters or missing title.
- **Returns:** List of paper dicts with `source="Semantic Scholar"`.

#### `_search_openalex(query, max_results)`
```python
def _search_openalex(query: str, max_results: int) -> list
```
- **Protocol:** Calls `https://api.openalex.org/works` with sort by `relevance_score:desc`. Includes `mailto=research@example.com` for polite pool rate limits.
- **Abstract reconstruction:** OpenAlex stores abstracts as inverted indices `{word: [position, ...]}`. `_reconstruct_abstract()` sorts words by their first position to recreate plain text.
- **Extracts:** `doi` (strips `https://doi.org/` prefix), `open_access.oa_url`, `cited_by_count`, `primary_location.source.display_name` for venue.
- **Returns:** List of paper dicts with `source="OpenAlex"`, `_arxiv_id=""`.

#### `_reconstruct_abstract(inverted_index)`
```python
def _reconstruct_abstract(inverted_index: dict) -> str
```
- **Purpose:** Convert OpenAlex inverted index `{word: [pos1, pos2, ...]}` to a plain text string.
- **Algorithm:** Build a `{position: word}` dict from all word→position mappings, then join words sorted by position key.
- **Error behaviour:** Returns empty string on any exception.

#### `_search_pubmed(query, max_results)`
```python
def _search_pubmed(query: str, max_results: int) -> list
```
- **Protocol:** Two-step NCBI E-utilities:
  1. `esearch.fcgi?db=pubmed&term={q}&retmax=N&sort=relevance&retmode=json` → get PMID list.
  2. `time.sleep(0.35)` to respect NCBI's 3 requests/second rate limit without an API key.
  3. `efetch.fcgi?db=pubmed&id={pmids}&retmode=xml` → parse PubmedArticle XML elements.
- **Abstract handling:** PubMed abstracts can be structured with multiple `<AbstractText>` sections each with a `Label` attribute (e.g., "BACKGROUND", "METHODS"). These are concatenated with their labels as prefixes.
- **Returns:** List of paper dicts with `source="PubMed"`, `citations=0` (PubMed does not provide citation counts natively), `_arxiv_id=""`, `_doi=""`.
- **Only called when:** `is_medical=True` from topic expansion.

#### `_deduplicate(papers)`
```python
def _deduplicate(papers: list) -> list
```
- **Purpose:** Remove duplicate papers that appear across multiple sources.
- **Three-level deduplication (checked in order):**
  1. **arXiv ID:** `_arxiv_id` exact match (after strip).
  2. **DOI:** `_doi` exact match (after strip and lower).
  3. **Normalised title:** `re.sub(r"[^a-z0-9]", "", title.lower())` exact match.
- **Merge strategy when duplicate found:**
  - `citations` = `max(existing.citations, candidate.citations)`
  - `abstract` = longer of the two
  - `url` = existing if non-empty, else candidate
  - `source` = comma-joined sorted set of both source names (e.g., `"OpenAlex, Semantic Scholar"`)
- **Better version detection:** A composite quality score `citations*10 + len(abstract) + 5*(url != "") + 3*(venue != "")` determines which version has more complete metadata; used only to decide merge direction, not to discard either.

#### `_score_and_rank(papers, relevance_concepts, rejection_signals, canonical_topic)`
```python
def _score_and_rank(
    papers: list,
    relevance_concepts: list,
    rejection_signals: list,
    canonical_topic: str
) -> list
```
- **Purpose:** Score all papers on four dimensions and return only papers above `RELEVANCE_THRESHOLD=20`, sorted descending by composite score.
- **Semantic score:** LLM batch scoring via `_get_llm_relevance_scores()` (see below). Default 50 if paper not in LLM result.
- **Citation score (log-normalised):** `log1p(citations) / log1p(max_citations) * 100`. If all papers have 0 citations, all receive 50.0 (neutral).
- **Recency score:**
  - age ≤ 3 years: 100.0
  - age 4-5 years: `100.0 - (age - 3) * 20.0` (range 60-100)
  - age 6-10 years: `60.0 - (age - 5) * 6.0` (range 30-60)
  - age > 10 years: `max(10.0, 30.0 - (age - 10) * 2.0)`
  - Unknown year: 50.0 (neutral)
- **Source score:** PubMed=90, Semantic Scholar=75, OpenAlex=70, arXiv=60. For merged multi-source papers, takes the maximum.
- **Composite formula:** `0.50 * semantic + 0.25 * citation + 0.15 * recency + 0.10 * source`
- **Scores written to paper dict:** `relevance_score`, `semantic_score`, `citation_score`, `recency_score`, `source_score`.

#### `_get_llm_relevance_scores(papers, relevance_concepts, rejection_signals, canonical_topic)`
```python
def _get_llm_relevance_scores(
    papers: list,
    relevance_concepts: list,
    rejection_signals: list,
    canonical_topic: str
) -> dict
```
- **Purpose:** Call Gemini to batch-score all papers for semantic relevance.
- **Compresses each paper to:** `{index, title, abstract[:400]}` before building the prompt.
- **Returns:** `{paper_index: score_int}` dict with scores clamped to [0, 100].
- **Error behaviour:** On any exception, falls back to `_keyword_relevance_scores()`.

#### `_keyword_relevance_scores(papers, relevance_concepts, rejection_signals)`
```python
def _keyword_relevance_scores(
    papers: list,
    relevance_concepts: list,
    rejection_signals: list
) -> dict
```
- **Purpose:** Lightweight fallback relevance scoring using string overlap.
- **Formula:** `score = 50 + (concept_hits / n_concepts) * 50 - rejection_hits * 30`, clamped to [0, 100].

#### `extract_from_pdf(file_obj)`
```python
def extract_from_pdf(file_obj) -> str | None
```
- **Primary path:** `import fitz` (PyMuPDF). Reads all bytes, opens as stream, iterates pages calling `page.get_text()`.
- **Fallback path (on `ImportError`):** `pdfminer.six`'s `extract_text_to_fp` into a `StringIO` buffer.
- **Post-processing:** `_extract_body()` to locate Abstract/Introduction; `clean_pdf_text()` to strip references section, emails, URLs, citation markers; `clean_extracted()` to normalise whitespace.
- **Returns:** Cleaned text string, or `None` if extraction fails entirely.
- **Known issue:** PyMuPDF 1.23.8 has a binary incompatibility with Python 3.14 (`_struct.error: unpack requires a buffer of 2 bytes`). On Python 3.14, `ImportError` is never raised (fitz imports successfully but crashes on `fitz.open()`), so pdfminer.six fallback is reached via the outer `except Exception` handler.

#### `_extract_body(text)`
```python
def _extract_body(text: str) -> str
```
- **Purpose:** Strip title/author/affiliation block from PDF text. Prefers Abstract→Introduction boundary. Falls back to Introduction alone. Falls back to skipping first 50 lines.

#### `extract_from_url(url)`
```python
def extract_from_url(url: str) -> str | None
```
- **arXiv special handling:** Converts `/pdf/` URLs to `/abs/` equivalent. Extracts the `<blockquote class="abstract">` element directly.
- **General handling:** Strips `<script>` and `<style>` blocks, then strips all remaining HTML tags.
- **Returns:** Cleaned text or `None`.

#### `clean_pdf_text(text)` and `clean_extracted(text)`
```python
def clean_pdf_text(text: str) -> str
def clean_extracted(text: str) -> str | None
```
- `clean_pdf_text`: Removes emails, URLs, references section, affiliation lines, inline citation markers `[N]` and `(Author, year)`. Normalises blank lines and spaces.
- `clean_extracted`: Normalises whitespace, filters sentences shorter than 20 characters, returns `None` if resulting text is shorter than 100 characters.

---

## 4. Backend Module: `analyzer.py`

### 4.1 Module Overview

`analyzer.py` transforms raw text into structured research analysis using Gemini (via `llm.py`). Provides one public function (`analyze_text`) and several private helpers. Also exports `compute_stats` which is used by `app.py` for multi-paper combined analyses.

### 4.2 Constants and Utilities

**`STOPWORDS`:** Set of 100+ common English words used in fallback keyword extraction and future text utilities.

#### `clean_text(text)`
```python
def clean_text(text: str) -> str
```
- Collapses whitespace; strips non-word/non-punctuation characters. Called at the start of `analyze_text`.

#### `compute_stats(text)`
```python
def compute_stats(text: str) -> dict
```
- **Returns:** `{word_count, sentence_count, avg_sentence_length, unique_words}`
- `sentence_count` counts sentences longer than 30 characters (filters stub sentences).
- `avg_sentence_length` = `word_count / max(sentence_count, 1)`, rounded to 1 decimal.
- **Used by:** `analyze_text`, `_fallback_analyze`, `_merge_analyses` in `app.py`.

#### `_fallback_keywords(text, top_n=12)`
```python
def _fallback_keywords(text: str, top_n: int = 12) -> list
```
- **Algorithm:** Extract unigrams (4+ letters, not in STOPWORDS), count frequency. Extract bigrams (both words not in STOPWORDS, both 4+ letters), count frequency. Bigrams appearing ≥2 times scored at `count * 2` are preferred. Fill remaining slots with top unigrams.
- **Returns:** List of `{term: str, score: int}` dicts, up to `top_n`.

### 4.3 Validation

#### `_validate_and_normalize(result, text)`
```python
def _validate_and_normalize(result: dict, text: str) -> dict
```
- **Purpose:** Ensure every expected key exists and that LLM-generated content is not generic placeholder text.
- **Generic phrase detection:** Checks against phrases: `"future work could explore"`, `"more datasets"`, `"larger models"`, `"not explicitly stated"`, `"no specific"`, `"not available"`, `"n/a"`.
- **Scalar defaults:** `executive_summary`, `research_problem`, `motivation`, `research_gap`, `main_contribution`, `field_maturity_assessment` — set to descriptive defaults if missing or empty.
- **Structured block defaults:**
  - `methodology`: `{overview, key_components: [], novelty}`
  - `datasets`: `[{name: "Not specified", type: "unknown", size: "unknown", domain: "unknown"}]`
  - `evaluation`: `{metrics: [], baselines: [], protocol: "Not specified."}`
  - `research_gaps`: 6 sub-keys all defaulting to `[]`
  - `future_scope`: `{author_suggested: [], ai_generated: []}`
- **List field validation:** `results_and_findings`, `strengths`, `weaknesses`, `limitations`, `key_takeaways`, `keywords` — set to fallback values if absent. Non-keyword list items shorter than 20 characters or matching generic phrases are filtered; originals kept if all items would be filtered.

### 4.4 Main Entry Point

#### `analyze_text(text)`
```python
def analyze_text(text: str) -> dict
```
- **Purpose:** Full analysis pipeline for a single paper text.
- **Inputs:** Raw text string.
- **Steps:**
  1. `clean_text(text)` — normalise.
  2. If `len(text) < 50`: return `{"error": "Text too short for analysis"}`.
  3. `compute_stats(text)`.
  4. `call_llm(paper_combined_prompt(text))` — get structured JSON from Gemini (single combined call).
  5. `_validate_and_normalize(result, text)`.
  6. Add `stats` key.
  7. Compute legacy flat keys:
     - `research_gaps_flat` = `_flatten_research_gaps(result["research_gaps"])`
     - `future_scope_flat` = `author_suggested + ai_generated`
     - `summary` = `result.get("executive_summary", "")` (via `setdefault`)
     - `important_sentences` = `result.get("key_takeaways", [])`
     - `contributions` = `[result.get("main_contribution", "")]`
     - `methods` = `[result["methodology"].get("overview", "")]`
     - `evaluation_metrics` = `result["evaluation"].get("metrics", [])`
- **Error behaviour:** Any exception in the LLM path calls `_fallback_analyze(text, stats)`.
- **Returns:** Analysis dict with both structured and legacy keys.

#### `_flatten_research_gaps(gaps_dict)`
```python
def _flatten_research_gaps(gaps_dict: dict) -> list
```
- Concatenates all 6 sub-lists into a single flat list.

### 4.5 Fallback Analysis

#### `_fallback_analyze(text, stats)`
```python
def _fallback_analyze(text: str, stats: dict) -> dict
```
- **Purpose:** Regex-based analysis when Gemini is unavailable.
- **Uses `extract_by_phrases(text, phrases)` internally** to find sentences containing specific phrase patterns.
- **Research gaps sub-categories:** Populated by matching phrases: `"limited to/restricted to/constraint"`, `"dataset/benchmark"`, `"generali/domain adaptation"`, `"real-world/deployment/practical"`, `"gap in/lack of/underexplored/not yet"`.
- **Returns:** Full dict with all structured keys (using fallback values) plus all legacy keys. Does not call LLM.

#### `_extract_methods(text)`
```python
def _extract_methods(text: str) -> list
```
- Scans lowercased text for 23 known ML/AI method keywords. Returns found methods in title case, deduplicated, up to 10. Falls back to `["No specific methods detected"]`.

---

## 5. Backend Module: `storage.py`

### 5.1 Module Overview

`storage.py` is the persistence layer. All data is stored as UTF-8 JSON files under `BASE_DIR = backend/data/workspaces/`. No thread locks — concurrent access within a single Flask process is sequential by default (Flask's development server is single-threaded; production WSGI would need file locking).

### 5.2 Path Helpers (Private)

| Function | Returns |
|---|---|
| `_ws_dir(workspace_id)` | `BASE_DIR/workspace_{id}` |
| `_ws_file(workspace_id, filename)` | `BASE_DIR/workspace_{id}/{filename}` |
| `_uploads_dir(workspace_id)` | `BASE_DIR/workspace_{id}/uploads` |
| `_now()` | UTC ISO-8601 timestamp with trailing `Z` |

### 5.3 Low-Level JSON Helpers (Private)

#### `_read_json(path, default)`
- Reads and parses JSON from `path`. Returns `default` on `FileNotFoundError` or `json.JSONDecodeError`. Silently ignores corrupt files.

#### `_write_json(path, data)`
- Calls `os.makedirs(dirname, exist_ok=True)` before writing. Writes with `indent=2, ensure_ascii=False`.

### 5.4 Workspace CRUD

#### `create_workspace(query)`
```python
def create_workspace(query: str) -> dict
```
- Generates `workspace_id = str(uuid.uuid4())[:8]` (8 hex characters).
- Creates directory `uploads/` (implicitly creates parent too via `os.makedirs`).
- Writes 5 JSON files: `metadata.json`, `papers.json=[]`, `analyses.json=[]`, `ideas.json=[]`, `chat.json=[]`.
- **Returns:** metadata dict `{id, query, created_at, last_opened, favorite: False, paper_count: 0, mode: "topic"}`.

#### `list_workspaces()`
```python
def list_workspaces() -> list
```
- Iterates `BASE_DIR` directory entries. Skips non-directory entries and directories without a valid `metadata.json` with an `id` field.
- **Returns:** List of metadata dicts sorted by `last_opened` descending.

#### `load_workspace(workspace_id)`
```python
def load_workspace(workspace_id: str) -> dict | None
```
- Checks workspace directory exists. Reads `metadata.json` first; returns `None` if missing or invalid.
- **Returns:** `{metadata, papers, analyses, ideas, chat}` or `None`.

#### `delete_workspace(workspace_id)`
```python
def delete_workspace(workspace_id: str) -> bool
```
- Calls `shutil.rmtree(ws_dir)`. Returns `True` if deleted, `False` if directory not found.

### 5.5 Save Helpers

| Function | Signature | Behaviour |
|---|---|---|
| `save_papers` | `(wid, papers: list) -> None` | Writes `papers.json`; also updates `paper_count` in `metadata.json`. |
| `save_analyses` | `(wid, analyses: list) -> None` | Writes `analyses.json`. |
| `save_ideas` | `(wid, ideas: list) -> None` | Writes `ideas.json` (reserved for future use). |
| `save_chat_message` | `(wid, role, content) -> dict` | Reads existing `chat.json`, appends `{id: uuid[:8], role, content, timestamp}`, writes back. Returns new message dict. |
| `save_uploaded_file` | `(wid, filename, file_bytes) -> str` | Creates `uploads/` if needed. Writes bytes to `uploads/{filename}`. Returns full path. |

### 5.6 Metadata Updates

| Function | Signature | Behaviour |
|---|---|---|
| `toggle_favorite` | `(wid) -> bool` | Reads metadata, flips `favorite` boolean, writes back. Returns new value. |
| `update_last_opened` | `(wid) -> None` | Reads metadata, sets `last_opened = _now()`, writes back. |
| `update_metadata` | `(wid, updates: dict) -> None` | Reads metadata, applies `dict.update(updates)`, writes back. Used to set `mode`, `query`, `paper_count`. |

---

## 6. Backend Module: `literature_review.py`

### 6.1 Functions

#### `generate_literature_review(papers, topic="")`
```python
def generate_literature_review(papers: list, topic: str = "") -> dict
```
- **Inputs:** `papers` — list of paper dicts (must have `title`, `abstract`, `authors`, `published`, `url`; optionally `analysis` pre-computed dict). `topic` — the research topic string.
- **Steps:**
  1. `_build_summary_table(papers)` — always computed as fallback.
  2. Build `papers_data` enriched from `analysis` sub-keys if present.
  3. `call_llm(literature_review_prompt(papers_json, topic_label))`.
  4. Inject missing `url` values into LLM-generated `summary_table` rows.
  5. Fill any missing sections with fallback generators.
- **Returns:** `{topic, paper_count, introduction, background, thematic_analysis, methodology_comparison, dataset_comparison, research_trends, conclusion_and_gaps, conclusion, summary_table, themes[], trajectory_notes:[], common_gaps[], common_limitations[], future_suggestions[]}`.
- **Error behaviour:** On any LLM exception, calls `_fallback_literature_review()`.

#### `_build_summary_table(papers)`
```python
def _build_summary_table(papers: list) -> list
```
- Builds one row per paper. Prefers `analysis.research_problem`, `analysis.main_contribution`, `analysis.methodology.overview`. Falls back to sentence pattern matching in the abstract. Truncates all string fields to safe lengths.

#### Fallback Section Generators
- `_fallback_intro(topic, n, papers)` — computes year range from papers; returns HTML `<h2>1. Introduction</h2>` with paragraph text.
- `_fallback_background(topic, papers)` — returns generic HTML `<h2>2. Background</h2>`.
- `_fallback_thematic(topic, n)` — returns HTML `<h2>3. Thematic Analysis</h2>` with two subsections.
- `_fallback_conclusion(topic, papers)` — scans all abstracts for gap/limitation/future-work sentences; builds `<h2>7...</h2>` with `<ul>` lists.
- `_fallback_literature_review(papers, topic, summary_table, n)` — assembles all fallback sections into the full dict.

---

## 7. Backend Module: `paper_draft.py`

### 7.1 Module Overview

`paper_draft.py` generates full, publication-quality research paper drafts from a set of reference papers and user-supplied metadata. It contains a single public function.

#### `generate_paper_draft(papers, title, research_question, methodology, contributions, target_venue, sections)`
```python
def generate_paper_draft(papers: list, title: str, research_question: str,
                          methodology: str, contributions: str, target_venue: str,
                          sections: list) -> dict
```
- **Purpose:** Generate a paper draft with HTML-formatted sections.
- **Inputs:**
  - `papers` — list of paper dicts with analyses; capped at 2 internally.
  - `title`, `research_question` — required; form the core of the prompt.
  - `methodology`, `contributions`, `target_venue` — optional; Gemini fills in if absent.
  - `sections` — list of section keys to generate (e.g., `["abstract", "introduction", "references"]`).
- **Reference building:** For each of the first 2 papers, builds a compact `paper_refs` dict with: `ref` (1-based index), `title`, `authors` (first 3), `year`, `summary` (first 350 chars), `contributions` (first 3), `methods` (first 3), `gaps` (first 2). Truncated to 7000 chars as JSON.
- **LLM call:** `call_llm(prompt, expect_json=True, max_retries=3, large_output=True)` — uses 8192 token output limit.
- **Returns:** Dict with one key per requested section (HTML string values) plus `title`, `research_question`, `paper_count`.
- **Error behaviour:** Rate limit errors propagate as `RuntimeError("RATE_LIMIT: ...")` to the Flask route, which converts them to HTTP 429.

---

## 8. Frontend Component Tree

```
App.jsx  (root — owns all global state)
├── Sidebar.jsx
│   ├── [brand header with collapse toggle]
│   ├── [New Research button → calls onNew]
│   ├── [Literature Reviews nav button → calls onLiteratureHome]
│   ├── [Paper Drafts nav button → calls onDraftHome]
│   ├── Section (Favorites)
│   │   └── WorkspaceItem × N  (click → onSelect, star → favorite, ✕ → delete)
│   └── Section (Recent)
│       └── WorkspaceItem × N
│
├── InputPage.jsx           (view === "home")
│   ├── [Mode tabs: topic | pdf | url | text]
│   ├── [Topic mode: text input + slider + Search button]
│   ├── [PDF mode: drag-drop zone + file chip list + Analyze button]
│   ├── [URL mode: text input + Analyze button]
│   └── [Text mode: textarea + Analyze button]
│
├── ResultsPage.jsx         (view === "results" && results !== null)
│   ├── [Results toolbar: title + view tabs + New Search button]
│   ├── SingleAnalysis       (single paper or "combined" view)
│   │   ├── stats-row (word count, sentence count, unique words, avg sentence len)
│   │   ├── Section: Summary
│   │   ├── Section: Keywords (keyword-cloud)
│   │   ├── Section: Methods (method-pills)
│   │   ├── Section: Contributions
│   │   ├── Section: Key Sentences
│   │   ├── Section: Research Gaps
│   │   ├── Section: Limitations
│   │   └── Section: Future Scope
│   ├── CompareView          (view === "compare" — multi-paper only)
│   │   └── [table: #, Title, Authors, Year, Keywords, Methods, Gaps, Limits, Future, Link]
│   └── PapersView           (view === "papers" — multi-paper only)
│       └── paper-card × N
│           └── [expandable: Research Gaps, Limitations, Future Scope, Methods detail blocks]
│
├── LiteratureReview.jsx    (view === "literature")
│   ├── [Load Papers button at top → fetches /api/workspaces]
│   ├── [Workspace list with paper checkboxes]
│   ├── [Generate button → POST /api/literature-review]
│   └── [Rendered sections via EditableSection (contentEditable, ref-based):
│        introduction, background, thematic_analysis, methodology_comparison,
│        dataset_comparison, research_trends, conclusion_and_gaps, conclusion]
│        [Summary table with EditableCell per cell]
│        [Export buttons: PDF (print), copy HTML]
│
└── PaperDraft.jsx          (view === "draft")
    ├── Phase 1 — WorkspacePicker
    │   ├── [Load Workspaces → GET /api/workspaces]
    │   ├── [Workspace expand → GET /api/workspaces/<wid>]
    │   └── [Paper checkboxes → Next button (requires ≥1 paper)]
    ├── Phase 2 — PaperSetup
    │   ├── [Title* input]
    │   ├── [Research Question* textarea]
    │   ├── [Methodology textarea (optional)]
    │   ├── [Contributions textarea (optional)]
    │   ├── [Target Venue input (optional)]
    │   ├── [Section checkboxes: abstract, introduction, related_work,
    │   │    methodology, results_discussion, conclusion, references]
    │   └── [Generate Draft button → POST /api/paper-draft]
    └── Phase 3 — DraftDisplay
        ├── [Section tabs: one tab per requested section]
        ├── [EditableSection per tab (contentEditable, ref-based)]
        └── [Export: PDF (print dialog), Word (.docx blob download)]
```

---

## 8. Frontend State Flow

### 8.1 App.jsx State

| State | Type | Initial | Description |
|---|---|---|---|
| `view` | `"home" \| "results" \| "literature" \| "draft"` | `"home"` | Which top-level page is rendered |
| `mode` | `"topic" \| "pdf" \| "url" \| "text"` | `"topic"` | Active input mode |
| `results` | `object \| null` | `null` | Analysis data from backend; includes `_mode` discriminator |
| `error` | `string \| null` | `null` | Error message shown in toast overlay |
| `loading` | `boolean` | `false` | Passed to InputPage to disable submit buttons |
| `currentWorkspaceId` | `string \| null` | `null` | Active workspace 8-char ID |
| `currentWorkspace` | `object \| null` | `null` | Full workspace data (loaded from API) |
| `sidebarRefresh` | `number` | `0` | Increment to trigger Sidebar workspace list refetch |
| `theme` | `"dark" \| "light"` | localStorage or `"dark"` | Applied as `data-theme` attribute on `<html>` |

### 8.2 State Transitions

```
Initial: view="home", results=null, currentWorkspaceId=null

[User submits form in InputPage]
  InputPage creates workspace via API → gets wid
  InputPage calls API endpoint → gets analysis data
  InputPage calls onResults(data, wid)
  → App: setResults(data), setView("results"), setCurrentWorkspaceId(wid), refreshSidebar()
  → ResultsPage renders

[User clicks workspace in Sidebar]
  Sidebar calls onSelect(id)
  → App: handleSelectWorkspace(id) → fetch /api/workspaces/{id}
  → If mode=topic: reconstruct topic results shape
  → If mode=pdf/url/text: use analyses[0] as results
  → setResults(...), setView("results"), setCurrentWorkspaceId(id)

[User clicks New Research]
  → App: handleNew() → setResults(null), setView("home"), setCurrentWorkspaceId(null)

[User clicks Literature Reviews]
  → App: handleLiteratureHome() → setView("literature"), setCurrentWorkspaceId(null)

[User clicks ← New Search in ResultsPage]
  → onBack() → handleNew() → view="home"

[User toggles theme]
  → setTheme() → localStorage.setItem("rai-theme", ...) + document.documentElement.setAttribute("data-theme", ...)
```

### 8.3 ResultsPage Internal State

| State | Type | Description |
|---|---|---|
| `view` | `"combined" \| "compare" \| "papers"` | Active sub-view for multi-paper results |

- `isMulti` = `mode === "topic" || Array.isArray(results.papers)`
- `papers` = `results.individual_papers` (topic) or `results.papers` (multi-PDF)
- `combined` = `results.combined_analysis` (topic) or `results.combined` (multi-PDF)
- Single-paper modes (url, text, single PDF): `!isMulti` — renders `SingleAnalysis` directly, no view tabs.

### 8.4 Sidebar Internal State

| State | Description |
|---|---|
| `workspaces` | Array of metadata dicts from `GET /api/workspaces` |
| `loading` | Boolean — show loading bar while fetching |
| `collapsed` | Boolean — sidebar collapsed to icon-only mode |

- Refetches on every `refreshTrigger` prop change.
- Splits workspaces into `favorites` (`.favorite === true`) and `recent` (`.favorite !== true`).
