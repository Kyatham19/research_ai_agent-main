# Literature Review Workflow

## Overview

The literature review workflow generates a full academic literature review from a set of papers
already known to the system. Unlike topic search (which retrieves papers) or PDF analysis (which
analyzes individual files), this workflow takes an existing collection of paper dicts — typically
from a completed topic search workspace — and synthesizes them into a coherent scholarly review
document. Gemini 1.5 Flash is prompted with a professor-style writing protocol to produce a
unified analytical narrative across 8 structured sections, in HTML format. If individual paper
analyses are attached to the input papers, those structured fields are used to enrich the
synthesis prompt. Comprehensive per-section fallback generation handles partial or total LLM
failure without exposing errors to the user.

---

## Prerequisites

| Requirement | Detail |
|-------------|--------|
| Minimum papers | **2 papers required.** The `/api/literature-review` endpoint returns HTTP 400 if fewer than 2 are supplied. |
| Paper fields | Each paper dict must have at least `title` and `abstract`. `authors`, `published` (year), and `url` are used for the summary table. |
| Optional analysis | Each paper may include an `analysis` sub-dict (pre-computed by `analyze_text()`). When present, structured fields (`research_problem`, `main_contribution`, `methodology`, `datasets`, `results_and_findings`, `limitations`, `research_gaps_flat`) are used in the prompt and summary table instead of abstract heuristics. |
| Topic string | A `topic` string provides the review's subject framing. Can be empty — defaults to `"the selected research area"`. |
| Workspace | `workspace_id` is accepted but not used for storage by the literature review route. The literature review result is returned in the HTTP response only; it is not persisted to a workspace. |

---

## Flow Diagram

```
LiteratureReview.jsx (frontend)
    |
    |  Select papers from current workspace analyses
    |  or paste paper list manually
    |  POST /api/literature-review
    |  Body: { papers: [...], topic: "...", workspace_id: "..." }
    v
app.py — literature_review()
    |
    |  Validation: len(papers) < 2  →  HTTP 400
    v
generate_literature_review(papers, topic)  [literature_review.py]
    |
    |-- _build_summary_table(papers)
    |       For each paper:
    |           - Derive author label (Last et al. (year))
    |           - Use analysis{} fields if present
    |           - Else: phrase-match abstracts for problem, contribution,
    |                   methodology, datasets, results, limitations
    |
    |-- Build papers_data list:
    |       For each paper, enrich with analysis{} structured fields
    |       Truncate abstract to 500 chars, authors to first 3
    |
    |-- call_llm(literature_review_prompt(papers_json, topic))
    |       Gemini writes 8 sections as HTML strings + structured arrays
    |
    |-- Inject paper URLs into LLM summary table
    |
    |-- Per-section fallback: fill any empty sections with
    |       _fallback_intro(), _fallback_background(),
    |       _fallback_thematic(), _fallback_conclusion()
    |
    |-- Return assembled result dict
    v
HTTP Response  →  LiteratureReview.jsx renders sections as HTML
```

---

## Step-by-Step Flow

### Step 1: HTTP Request

```
POST /api/literature-review
Content-Type: application/json

{
  "papers": [
    {
      "title": "Attention Is All You Need",
      "abstract": "We propose a new simple network...",
      "authors": ["Vaswani, A.", "Shazeer, N."],
      "published": "2017",
      "url": "https://arxiv.org/abs/1706.03762",
      "analysis": {
        "research_problem": "...",
        "main_contribution": "...",
        "methodology": { "overview": "...", "key_components": [] },
        "datasets": [{ "name": "WMT 2014 English-German", ... }],
        "results_and_findings": ["..."],
        "limitations": ["..."],
        "research_gaps_flat": ["..."]
      }
    },
    { ... }
  ],
  "topic": "transformer architectures in NLP",
  "workspace_id": "3b94059e"
}
```

The `app.py` route validates `len(papers) >= 2` and calls `generate_literature_review()`.

---

### Step 2: Summary Table Construction

**File:** `backend/literature_review.py` — `_build_summary_table(papers)`

This step runs first and always — before any LLM call. It produces a fallback table that
is used if the LLM does not return a `summary_table` array, and provides a structural
scaffold for the review.

**Author label construction:**
```python
author_str = authors[0].split()[-1]  # last name of first author
year = published[:4] or "N/A"
label = f"{author_str} et al. ({year})"  # if 2+ authors
       # or f"{author_str} ({year})"     # if solo author
```

**For each table column, the system prefers structured analysis fields, then falls back to
abstract phrase matching using `_first_sentence_containing()`:**

| Column | Preferred source | Fallback phrase keywords |
|--------|-----------------|--------------------------|
| `research_problem` | `analysis.research_problem` | `"problem"`, `"challenge"`, `"task"`, `"issue"` |
| `contribution` | `analysis.main_contribution` | `"propose"`, `"present"`, `"introduce"`, `"develop"`, `"novel"` |
| `methodology` | `analysis.methodology.overview` or `analysis.methods[:3]` joined | `"using"`, `"based on"`, `"via"`, `"employ"`, `"utilize"`, `"framework"` |
| `datasets` | `analysis.datasets[].name` joined | Not phrase-matched — defaults to `"Not specified"` |
| `key_results` | `analysis.results_and_findings[0]` | `"results show"`, `"achieve"`, `"outperform"`, `"demonstrate"` |
| `limitations` | `analysis.limitations[0]` | `"limitation"`, `"drawback"`, `"cannot"`, `"restricted"` |

All fields are truncated to safe lengths (250, 200, or 150 characters depending on column)
to keep the summary table compact.

---

### Step 3: Build Enriched Papers Data for LLM Prompt

```python
papers_data = []
for p in papers:
    analysis = p.get("analysis", {})
    entry = {
        "title":             p.get("title", "Unknown"),
        "authors":           p.get("authors", [])[:3],
        "published":         p.get("published", "")[:4],
        "abstract":          p.get("abstract", "")[:500],
        "url":               p.get("url", ""),
        "research_problem":  analysis.get("research_problem", ""),
        "main_contribution": analysis.get("main_contribution", ""),
        "methodology":       analysis.get("methodology", {}).get("overview", "")
                             if isinstance(analysis.get("methodology"), dict)
                             else str(analysis.get("methods", "")),
        "datasets":          [d.get("name", d) for d in (analysis.get("datasets") or [])][:3],
        "key_results":       analysis.get("results_and_findings", [])[:2],
        "limitations":       analysis.get("limitations", [])[:2],
        "research_gaps":     analysis.get("research_gaps_flat", [])[:2],
    }
    papers_data.append(entry)
```

Papers with pre-computed analyses provide substantially richer context. The `methodology` field
handles both the new nested dict format (`{"overview": "...", "key_components": [...]}`) and
the legacy flat `methods` list.

---

### Step 4: LLM Synthesis Call

**File:** `backend/llm.py` — `literature_review_prompt(papers_json, topic)`

The prompt instructs Gemini to act as a professor writing a formal academic literature review.
The papers JSON (truncated to 9,000 characters total) is included.

**Anti-summary rules enforced in the prompt:**
- Each section must advance an argument or reveal a pattern
- Cite papers by author/year inline (e.g., "Smith et al. (2023) demonstrate...")
- Identify tensions, progressions, and unresolved questions
- `thematic_analysis` must NOT read as summaries — must compare and synthesize
- `common_gaps` must be evidence-based, tracing each gap to specific papers
- `future_suggestions` must be specific and actionable (not "more data", "larger models")

Gemini returns a JSON object with all 8 sections as HTML strings plus structured arrays.
`call_llm()` in `llm.py` strips markdown code fences, parses JSON, and returns a dict.

---

### Step 5: URL Injection into LLM Summary Table

The LLM generates its own summary table, but cannot reliably reproduce paper URLs.
The backend injects the original URLs by index:

```python
llm_table = result.get("summary_table", [])
for i, row in enumerate(llm_table):
    if i < len(papers) and not row.get("url"):
        row["url"] = papers[i].get("url", "")
```

This preserves the LLM's content while guaranteeing each table row has a working link.

---

### Step 6: Per-Section Fallback

Each section is checked independently. Empty or missing sections are replaced:

| Section | Fallback function | Fallback content |
|---------|------------------|-----------------|
| `introduction` | `_fallback_intro(topic, n, papers)` | HTML with paper count, year range, review scope statement |
| `background` | `_fallback_background(topic, papers)` | Generic HTML describing domain evolution |
| `thematic_analysis` | `_fallback_thematic(topic, n)` | HTML with 3.1 Methodological Approaches + 3.2 Empirical Evaluation subsections |
| `conclusion_and_gaps` | `_fallback_conclusion(topic, papers)` | HTML built from regex phrase-matching abstracts for gaps/limitations/future sentences |
| `methodology_comparison` | None — left empty | `""` |
| `dataset_comparison` | None — left empty | `""` |
| `research_trends` | None — left empty | `""` |
| `conclusion` | None — left empty | `""` |

Per-section fallbacks activate when the LLM returns an empty string or `None` for that
section, but succeeds on others. This is the most common partial-failure scenario (e.g.,
Gemini's response is truncated at token limit).

---

### Step 7: Full Fallback

**File:** `backend/literature_review.py` — `_fallback_literature_review()`

If the `call_llm()` call raises any exception (API key missing, network error, JSON parse
failure, Gemini quota exceeded), the entire LLM path is bypassed and a fully deterministic
review is generated using regex phrase matching on paper abstracts.

**Gap/limitation/future extraction:**

```python
gap_phrases    = ["gap in", "lack of", "underexplored", "limited research", "not yet", "open problem"]
limit_phrases  = ["limitation", "limited by", "drawback", "constraint", "weakness", "unable", "cannot"]
future_phrases = ["future work", "future research", "can be extended", "further investigation", "next step"]
```

For each phrase category, `find_sentences()` splits each paper's abstract on sentence
boundaries and returns sentences containing any of the target phrases (up to 3 per paper,
up to 5 unique sentences total after deduplication via `dict.fromkeys`).

The full fallback returns:
- The 4 sections that have fallback functions: introduction, background, thematic_analysis,
  conclusion_and_gaps (all generated by their respective `_fallback_*` functions)
- Empty strings for methodology_comparison, dataset_comparison, research_trends, conclusion
- The pre-computed `summary_table` from `_build_summary_table()`
- `common_gaps`, `common_limitations`, `future_suggestions` from regex extraction

---

## LLM Synthesis Protocol — 8 Sections

The `literature_review_prompt` instructs Gemini to produce exactly these sections:

### Section 1: Introduction (HTML)
- Establishes research domain and significance
- States the review scope (how many papers, time span)
- Introduces key themes to be examined
- Must include paper count and year range

### Section 2: Background (HTML)
- Describes foundational concepts and prior work
- Explains the technical context needed to understand the reviewed papers
- Describes the evolution of approaches up to the period covered

### Section 3: Thematic Analysis (HTML)
- Divided into named subsections (3.1, 3.2, 3.3...) by theme
- Each subsection synthesizes what multiple papers contribute to that theme
- Must reference at least 2 papers per theme
- Must NOT summarize papers sequentially

### Section 4: Methodology Comparison (HTML)
- Compares methodological approaches across papers
- Identifies dominant method families and where approaches diverge
- Names methods that show the most promise and explains why
- Identifies consistently recurring methodological limitations

### Section 5: Dataset and Evaluation Landscape (HTML)
- Compares datasets used across papers
- Identifies repeatedly-used benchmarks and underrepresented domains
- Analyzes inconsistencies in evaluation protocols across papers

### Section 6: Research Trends (HTML)
- Describes field trajectory across the reviewed papers
- What has improved, what has stagnated, what directions are emerging
- Every claim supported by evidence from specific papers

### Section 7: Research Gaps, Limitations and Future Directions (HTML)
- Structured with subsections:
  - 7.1 Research Gaps (bulleted, each citing which papers reveal the gap)
  - 7.2 Common Limitations (bulleted, with paper evidence)
  - 7.3 Future Research Directions (bulleted, specific and actionable)

### Section 8: Conclusion (HTML)
- Summarizes what the body of work collectively establishes
- States the field's current frontier
- Ends with a forward-looking statement about the most important open problem

---

## Output Structure

The `/api/literature-review` endpoint returns a JSON object with these fields:

| Field | Type | Description |
|-------|------|-------------|
| `topic` | string | The topic label used for the review |
| `paper_count` | integer | Number of papers included |
| `introduction` | string (HTML) | Section 1 content |
| `background` | string (HTML) | Section 2 content |
| `thematic_analysis` | string (HTML) | Section 3 content with subsections |
| `methodology_comparison` | string (HTML) | Section 4 content |
| `dataset_comparison` | string (HTML) | Section 5 content |
| `research_trends` | string (HTML) | Section 6 content |
| `conclusion_and_gaps` | string (HTML) | Section 7 content |
| `conclusion` | string (HTML) | Section 8 content |
| `summary_table` | array | Per-paper rows (title, authors, research_problem, contribution, methodology, datasets, key_results, limitations, url) |
| `themes` | string[] | Short theme labels extracted by Gemini |
| `trajectory_notes` | array | Always `[]` — reserved, not populated |
| `common_gaps` | string[] | Up to 6 evidence-based gap statements |
| `common_limitations` | string[] | Up to 5 recurring limitation statements |
| `future_suggestions` | string[] | Up to 6 specific future research directions |

### Summary Table Row Shape

```json
{
  "title": "Attention Is All You Need",
  "authors": "Vaswani et al. (2017)",
  "research_problem": "Sequential computation in RNNs prevents parallelization...",
  "contribution": "The Transformer, relying entirely on self-attention...",
  "methodology": "Multi-head self-attention with positional encoding...",
  "datasets": "WMT 2014 English-German, WMT 2014 English-French",
  "key_results": "Achieved 28.4 BLEU on WMT 2014 EN-DE, +2 over prior SOTA",
  "limitations": "Computational cost quadratic in sequence length",
  "url": "https://arxiv.org/abs/1706.03762"
}
```

All HTML sections are rendered directly in the `LiteratureReview.jsx` component using
`dangerouslySetInnerHTML`. The sections use `<h2>`, `<h3>`, `<p>`, `<ul>`, `<li>`, and
`<strong>` tags that match the application's CSS.
