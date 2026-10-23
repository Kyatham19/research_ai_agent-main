# Topic Search Workflow

## Overview

The topic search workflow is the core research retrieval pipeline of the Research AI Agent. When a
user submits a research topic, the system uses Gemini 1.5 Flash to intelligently expand and
understand that topic, then fans out across four academic sources concurrently (arXiv, Semantic
Scholar, OpenAlex, and PubMed for medical topics), deduplicates and ranks the combined result set
using both LLM semantic scoring and deterministic signals (citations, recency, source authority),
deep-analyzes each paper individually with a 10-question chain-of-thought protocol, synthesizes
cross-paper insights, and finally saves everything to a file-based workspace. The full round-trip
including LLM calls typically takes 20-60 seconds depending on the number of papers requested and
network latency to external APIs.

---

## Swimlane Diagram

```
User              Frontend (React)       Backend (Flask)         External APIs          LLM (Gemini)
 |                     |                      |                       |                      |
 |--enter topic------->|                      |                       |                      |
 |--set max_papers---->|                      |                       |                      |
 |--click Search------>|                      |                       |                      |
 |                     |--POST /api/workspaces|                       |                      |
 |                     |   {query}            |                       |                      |
 |                     |<--{id, created_at}---|                       |                      |
 |                     |                      |                       |                      |
 |                     |--POST /analyze/topic-|                       |                      |
 |                     |  {topic, max_papers, |                       |                      |
 |                     |   workspace_id}      |                       |                      |
 |                     |                      |--topic_expansion_---->|                      |
 |                     |                      |   prompt(topic)       |                      |
 |                     |                      |<--{canonical_topic,---|                      |
 |                     |                      |   domain, is_medical, |                      |
 |                     |                      |   search_queries,     |                      |
 |                     |                      |   arxiv_categories,   |                      |
 |                     |                      |   relevance_concepts, |                      |
 |                     |                      |   rejection_signals}  |                      |
 |                     |                      |                       |                      |
 |                     |                      |==ThreadPoolExecutor(4 workers)==              |
 |                     |                      |--arXiv Atom XML API-->|                      |
 |                     |                      |--S2 /paper/search---->|                      |
 |                     |                      |--OpenAlex /works----->|                      |
 |                     |                      |--PubMed esearch------>|  (medical only)      |
 |                     |                      |--PubMed efetch------->|  (medical only)      |
 |                     |                      |<--raw paper lists-----|                      |
 |                     |                      |==end concurrent fetch==                      |
 |                     |                      |                       |                      |
 |                     |                      |  deduplicate()        |                      |
 |                     |                      |  (3-level merge)      |                      |
 |                     |                      |                       |                      |
 |                     |                      |--relevance_scoring_-->|                      |
 |                     |                      |   prompt(papers,      |                      |
 |                     |                      |   concepts, signals)  |                      |
 |                     |                      |<--[{index,score,------                       |
 |                     |                      |    reason},...] ------>                      |
 |                     |                      |                       |                      |
 |                     |                      |  composite scoring    |                      |
 |                     |                      |  filter < threshold   |                      |
 |                     |                      |  sort descending      |                      |
 |                     |                      |                       |                      |
 |                     |           [for each paper in top N]          |                      |
 |                     |                      |--analyze_paper_prompt(abstract)------------->|
 |                     |                      |<--{structured analysis dict}-----------------|
 |                     |                      |           [end loop]  |                      |
 |                     |                      |                       |                      |
 |                     |                      |--multi_paper_analysis_prompt(blocks, topic)->|
 |                     |                      |<--{synthesis JSON}----|                      |
 |                     |                      |                       |                      |
 |                     |                      |  save_papers()        |                      |
 |                     |                      |  save_analyses()      |                      |
 |                     |                      |  update_metadata()    |                      |
 |                     |                      |                       |                      |
 |                     |<--{topic, paper_count|                       |                      |
 |                     |   individual_papers, |                       |                      |
 |                     |   combined_analysis, |                       |                      |
 |                     |   workspace_id}------|                       |                      |
 |<--ResultsPage renders|                     |                       |                      |
```

---

## Step-by-Step Flow

### Step 0: Workspace Creation (Frontend, before HTTP request)

**Trigger:** User clicks "Search" in `InputPage.jsx`.

Before making the analysis request, `InputPage.jsx` calls `createWorkspace(query)`:

```
POST /api/workspaces
Body: { "query": "<topic string>" }
Response: { "id": "<8-char uuid>", "query": "...", "created_at": "...",
            "last_opened": "...", "favorite": false, "paper_count": 0, "mode": "topic" }
```

The returned `id` (e.g., `3b94059e`) is passed as `workspace_id` in the subsequent
`/analyze/topic` request. If workspace creation fails (network error), `wid` is set to `null`
and the analysis still proceeds — workspace saving is non-critical.

---

### Step 1: Topic Expansion via Gemini

**File:** `backend/extractors.py` — `expand_topic(topic)`

The first LLM call converts a raw user-entered topic string into a structured search plan.

**Prompt:** `topic_expansion_prompt(topic)` in `backend/llm.py`

Gemini is instructed to act as a research librarian and returns a JSON object:

```json
{
  "canonical_topic": "Retinal Vessel Segmentation",
  "domain": "medical",
  "is_medical": true,
  "arxiv_categories": ["eess.IV", "cs.CV"],
  "search_queries": [
    "retinal vessel segmentation deep learning",
    "fundus image blood vessel detection neural network",
    "optic disc retina U-Net segmentation",
    "diabetic retinopathy vessel extraction benchmark",
    "survey retinal fundus image analysis"
  ],
  "relevance_concepts": [
    "retinal vessel", "fundus image", "segmentation", "ophthalmology",
    "blood vessel detection", "DRIVE dataset"
  ],
  "rejection_signals": [
    "brain vessel", "coronary artery", "non-retinal imaging"
  ]
}
```

**LLM failure fallback:** If `call_llm()` raises any exception or returns a response
missing required keys, `expand_topic()` catches the exception and returns a safe default:

```python
{
    "canonical_topic": topic,          # original user string, unchanged
    "domain": "other",
    "is_medical": _is_medical_fallback(topic),  # keyword check
    "arxiv_categories": ["cs.LG", "cs.AI"],
    "search_queries": [topic],         # only one query — reduced recall
    "relevance_concepts": [topic],
    "rejection_signals": [],
}
```

`_is_medical_fallback()` scans the topic for 34 hardcoded medical keywords
(`disease`, `clinical`, `retinal`, `cancer`, `mri`, etc.).

---

### Step 2: Concurrent Multi-Source Fetch

**File:** `backend/extractors.py` — `search_papers()`, lines 125–173

A `ThreadPoolExecutor(max_workers=4)` runs all four source fetchers simultaneously.
This reduces wall-clock time by approximately 3x compared to sequential requests.

**Fetch budget per source:**
```python
fetch_per_source = max(max_papers * 3, 20)
```
For `max_papers=5`, `fetch_per_source=20`. This over-fetches so the ranking step
has enough candidates to select from.

#### 2a. arXiv (top 3 queries)

- **API:** `https://export.arxiv.org/api/query` — Atom XML format
- **URL pattern:**
  ```
  search_query=(ti:{query}+OR+abs:{query})+AND+(cat:{cat1}+OR+cat:{cat2})
  &sortBy=relevance&sortOrder=descending
  ```
- **Parsing:** XML namespace `http://www.w3.org/2005/Atom`, extracts `entry` elements
- **Fields captured:** title, abstract (from `<summary>`), authors (up to 6), year (from
  `<published>`), arxiv_id (parsed from `<id>` URL), full `<id>` URL
- **Citation count:** Always 0 (arXiv does not provide citation data)
- **Minimum abstract length:** 50 characters; shorter entries are skipped

**Failure behavior:** Any exception (timeout, XML parse error, network failure) causes
`_search_arxiv_api()` to print an error message and return `[]` for that query.
The ThreadPoolExecutor catches it via `future.result()` and records 0 papers for arXiv.

#### 2b. Semantic Scholar (top 4 queries)

- **API:** `https://api.semanticscholar.org/graph/v1/paper/search`
- **Fields requested:** `title,abstract,authors,year,externalIds,citationCount,venue,openAccessPdf,fieldsOfStudy`
- **URL priority for paper links:**
  1. `openAccessPdf.url` (open access full PDF)
  2. `https://arxiv.org/abs/{ArXiv ID}` (if externalIds.ArXiv present)
  3. `https://doi.org/{DOI}` (if DOI present)
  4. `https://pubmed.ncbi.nlm.nih.gov/{PubMed ID}/` (if PMID present)
  5. Empty string
- **Citation counts:** Real values from Semantic Scholar's citation graph
- **No API key required** (but rate-limited at ~100 requests/5 min without key)

**Failure behavior:** Returns `[]` for that query on any exception.

#### 2c. OpenAlex (top 3 queries)

- **API:** `https://api.openalex.org/works`
- **Parameters:** `search={query}&sort=relevance_score:desc&mailto=research@example.com`
  (the `mailto` parameter opts into the "polite pool" for better rate limits)
- **Abstract reconstruction:** OpenAlex stores abstracts as inverted indexes:
  ```json
  {"word": [position1, position2], ...}
  ```
  `_reconstruct_abstract()` sorts by position and joins to plain text.
- **URL priority:** `open_access.oa_url` then `https://doi.org/{doi}`

**Failure behavior:** Returns `[]` for that query on any exception.

#### 2d. PubMed (top 3 queries — medical topics only)

Called only when `is_medical=true`. Uses NCBI E-utilities (no API key required).

**Two-step protocol:**

Step A — `esearch` to get PMIDs:
```
https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi
  ?db=pubmed&term={query}&retmax={N}&sort=relevance&retmode=json
```

**Rate limit pause:** `time.sleep(0.35)` between esearch and efetch to respect NCBI's
3-requests-per-second limit for unauthenticated clients.

Step B — `efetch` to get full XML records:
```
https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi
  ?db=pubmed&id={pmid1,pmid2,...}&retmode=xml
```

- **Structured abstracts:** PubMed articles often have labeled sections
  (BACKGROUND, METHODS, RESULTS, CONCLUSIONS). Each section is extracted with its
  label and concatenated.
- **Citation count:** Always 0 (PubMed does not provide citation counts natively)
- **Venue:** Extracted from `<Journal><Title>` element

**Failure behavior:** Returns `[]` on any exception, including NCBI rate-limit errors.
If PubMed is down, the other three sources still return results normally.

---

### Step 3: Deduplication

**File:** `backend/extractors.py` — `_deduplicate(papers)`

Papers from all four sources are merged into one list and deduplicated in three levels,
checked in priority order:

| Level | Key | How |
|-------|-----|-----|
| 1 | arXiv ID | Exact string match on `_arxiv_id` field |
| 2 | DOI | Lowercased exact match on `_doi` field |
| 3 | Normalized title | `re.sub(r"[^a-z0-9]", "", title.lower())` — strips all punctuation/spaces |

When a duplicate is found, the two records are **merged** rather than discarded:

- **Citations:** `max(existing.citations, candidate.citations)` — take higher value
- **Abstract:** Take the longer of the two strings
- **URL:** Keep existing unless empty, then take candidate's URL
- **Source field:** Combine unique source names with comma (e.g., `"arXiv, Semantic Scholar"`)

The merge strategy means a paper found on both arXiv and Semantic Scholar will have the
Semantic Scholar citation count and the arXiv abstract if it is longer, and the source field
will read `"arXiv, Semantic Scholar"`.

---

### Step 4: Relevance Scoring and Ranking

**File:** `backend/extractors.py` — `_score_and_rank()`

Four scores are computed and combined into a single composite score.

#### 4a. Semantic Score (weight: 50%)

`_get_llm_relevance_scores()` calls Gemini with `relevance_scoring_prompt()`.
The prompt sends a compact list of papers (title + first 400 characters of abstract)
and asks Gemini to return `[{index, score, reason}]` for each paper.

Score meanings:
- 90–100: Directly about the topic; core concepts in title and abstract
- 70–89: Closely related; addresses 3–4 core concepts
- 50–69: Relevant but tangential
- 20–49: Partial overlap
- 0–19: Not relevant

**LLM failure fallback — keyword overlap scoring:**
```python
score = 50 + (concept_hits / n_concepts) * 50 - rejection_hits * 30
```
Each matching `relevance_concept` in the paper's title+abstract adds proportional points.
Each matching `rejection_signal` subtracts 30 points. Score is clamped to [0, 100].

#### 4b. Citation Score (weight: 25%)

Log-normalized across the batch:
```python
citation_score = (log1p(citations) / log1p(max_citations)) * 100
```
If all papers have 0 citations (e.g., all from arXiv), every paper gets 50.0.

#### 4c. Recency Score (weight: 15%)

| Age (years) | Score |
|-------------|-------|
| 0–3 | 100.0 |
| 4–5 | 100.0 − (age − 3) × 20 → range 60–100 |
| 6–10 | 60.0 − (age − 5) × 6 → range 30–60 |
| >10 | max(10.0, 30.0 − (age − 10) × 2) |
| Unknown year | 50.0 (neutral) |

#### 4d. Source Authority Score (weight: 10%)

| Source | Score |
|--------|-------|
| PubMed | 90 |
| Semantic Scholar | 75 |
| OpenAlex | 70 |
| arXiv | 60 |

Papers merged from multiple sources take the **maximum** of their component scores.

#### Composite Formula

```
composite = 0.50 × semantic + 0.25 × citation + 0.15 × recency + 0.10 × source
```

Papers scoring below `RELEVANCE_THRESHOLD = 20` are dropped entirely.
Remaining papers are sorted descending by composite score.

---

### Step 5: Per-Paper Deep Analysis

**File:** `backend/app.py`, `backend/analyzer.py` — `analyze_text(abstract)`

For each paper in the top N, `analyze_text()` is called with the paper's abstract.
This invokes `analyze_paper_prompt(text)` — a 10-question chain-of-thought protocol:

1. What specific problem does this paper address? Why does it matter?
2. What gap in prior work motivates this paper?
3. What is the core methodological contribution? What makes it novel?
4. What datasets were used?
5. How is performance evaluated?
6. What do the results actually show?
7. What does the paper itself admit it cannot do?
8. What would a rigorous peer reviewer criticize?
9. What future work do the authors explicitly suggest?
10. What future work is implied by gaps but not stated?

Gemini reasons through these internally and returns a structured JSON with 20+ fields:

```
executive_summary, research_problem, motivation, research_gap, main_contribution,
methodology {overview, key_components, novelty},
datasets [{name, type, size, domain}],
evaluation {metrics, baselines, protocol},
results_and_findings[], strengths[], weaknesses[], limitations[],
research_gaps {from_limitations, from_missing_datasets, from_missing_benchmarks,
               from_generalization, from_deployment, from_unsolved_problems},
future_scope {author_suggested, ai_generated[]},
key_takeaways[], keywords[]
```

`_validate_and_normalize()` then enforces completeness: fills in missing keys with
defaults, rejects generic placeholder phrases, and flattens nested structures for legacy
UI consumers. Legacy keys are added for backward compatibility:
`summary`, `important_sentences`, `contributions`, `methods`, `evaluation_metrics`.

**LLM failure fallback — `_fallback_analyze()`:**
Uses regex phrase-matching to extract sentences by keyword proximity
(`"we propose"`, `"limitation"`, `"future work"`, etc.).
Keyword frequency counts provide fallback `keywords`.

This step is the **performance bottleneck**: one Gemini call per paper, sequential.
For 10 papers, expect 10 × 2–4 seconds = 20–40 seconds just for this step.

---

### Step 6: Combined Multi-Paper Synthesis

**File:** `backend/app.py` — calls `multi_paper_analysis_prompt(paper_blocks, topic)`

After all individual analyses are complete, the system builds a structured text block for
each paper (title, authors, year, source, citations, summary, contributions, methods,
gaps, limitations, future scope) and sends all blocks to Gemini in one call.

The synthesis prompt explicitly forbids sequential summarization. Gemini is asked to:
- Find methodological families across papers
- Compare datasets and evaluation protocols
- Identify where papers agree vs. contradict each other
- Surface recurring limitations no single paper reveals
- Identify gaps that no paper addresses at all
- Assess field maturity

Output fields:
```
synthesis_summary, common_themes[], method_comparison{}, dataset_comparison{},
evaluation_comparison{}, areas_of_agreement[], areas_of_disagreement[],
research_trends[], recurring_limitations[], recurring_research_gaps[],
future_research_opportunities[], field_maturity_assessment,
keywords[], datasets[], evaluation_metrics[], methods[]
```

**LLM failure fallback — `_merge_analyses()`:**
Pure Python merge: deduplicates list fields from all individual analyses (research_gaps,
limitations, future_scope, contributions, methods, keywords) using lowercase prefix
matching to avoid exact duplicates. No synthesis occurs — this is a mechanical merge,
not a reasoned one. The top 12 keywords by score, top 6 gaps, and top 6 future scope
items are returned.

---

### Step 7: Storage

**File:** `backend/storage.py`

Three writes occur at the end of a successful `/analyze/topic` response:

```python
save_papers(wid, papers)           # writes backend/data/workspaces/workspace_<id>/papers.json
save_analyses(wid, results)        # writes analyses.json
update_metadata(wid, {             # merges into metadata.json
    "mode": "topic",
    "paper_count": len(papers)
})
```

---

### Step 8: Response and Display

**HTTP response shape:**
```json
{
  "topic": "retinal vessel segmentation",
  "paper_count": 5,
  "individual_papers": [ /* array of analyze_text() results + paper metadata */ ],
  "combined_analysis": { /* multi_paper_analysis_prompt result */ },
  "workspace_id": "3b94059e"
}
```

In `InputPage.jsx`, `onResults({ ...data, _mode: "topic" }, wid)` is called.
`App.jsx` updates state: `setResults(data)`, `setView("results")`, `setCurrentWorkspaceId(wid)`,
and triggers a sidebar refresh. `ResultsPage` renders from the `results` prop.

---

## Timing Notes

| Phase | Approximate time |
|-------|-----------------|
| Workspace creation | ~50ms |
| Topic expansion (Gemini) | 1–3s |
| Concurrent multi-source fetch | 3–8s (all 4 sources in parallel) |
| Deduplication | <100ms |
| LLM relevance scoring | 2–5s |
| Composite scoring + filter | <100ms |
| Per-paper analysis (×N Gemini calls, sequential) | 3–6s per paper |
| Multi-paper synthesis (1 Gemini call) | 3–8s |
| Storage writes | <200ms |

**For 5 papers:** ~25–40 seconds total. The per-paper analysis loop dominates.
**For 10 papers:** ~45–70 seconds total.

The concurrent fetch saves approximately 3× versus sequential source requests.
All four external API calls complete within the same ~8 second window.

---

## Fallback Paths Summary

| Step | Normal path | Fallback |
|------|-------------|----------|
| Topic expansion | Gemini JSON | Keyword `is_medical` check; `search_queries=[topic]` |
| arXiv fetch | Atom XML parse | Returns `[]`; other sources continue |
| Semantic Scholar | JSON REST | Returns `[]`; other sources continue |
| OpenAlex | JSON REST | Returns `[]`; other sources continue |
| PubMed | esearch + efetch XML | Returns `[]`; only skipped if `is_medical=false` |
| All sources return 0 | — | `_mock_papers()`: 3 labeled `[DEMO]` papers |
| LLM relevance scoring | Gemini JSON array | Keyword overlap formula |
| Per-paper analysis | Gemini JSON | `_fallback_analyze()` regex extraction |
| Multi-paper synthesis | Gemini JSON | `_merge_analyses()` mechanical list merge |

---

## "What If" Scenarios

### A source is temporarily down

Each source fetch is wrapped in `try/except`. If arXiv returns a 503, only arXiv
papers are missing from the result set. If Semantic Scholar times out (25s timeout),
the other three sources complete normally. The `ThreadPoolExecutor` collects results
from whichever futures succeed; failed futures log an error and contribute 0 papers.

### Topic returns 0 papers from all sources

If `all_papers` is empty after the concurrent fetch, `_mock_papers()` is called.
This returns 2–3 labeled `[DEMO]` papers with synthetic titles and abstracts, clearly
marked as demos. The backend does NOT return a 404 at this stage — the error check
`if not papers` after ranking would return a 404, but mock papers have `relevance_score=50`
so they pass the threshold filter.

### All papers fall below the relevance threshold

If `_score_and_rank()` drops every paper (all score < 20), `scored_papers` is empty,
`final = []`, and the route handler returns:
```json
HTTP 404
{"error": "No papers found for this topic"}
```
The frontend catches `!res.ok` and calls `onError(data.error)`, displaying an error toast.

### Gemini API key is not configured

`_configure()` raises `EnvironmentError("GEMINI_API_KEY not set.")` before any
LLM call. `expand_topic()` catches it and uses the keyword fallback. `analyze_text()`
catches it and uses `_fallback_analyze()`. `multi_paper_analysis_prompt()` raises,
and `_merge_analyses()` is used. The system still returns results — all LLM-powered
enrichment degrades gracefully to deterministic fallbacks.
