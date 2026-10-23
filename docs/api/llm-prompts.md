# LLM Prompts Reference — Research AI Agent

## Overview

This document describes every Gemini prompt used in the Research AI Agent backend, including the exact reasoning protocols embedded in each prompt, how the outputs are parsed, and how failures are handled.

All prompts live in `backend/llm.py`. The two companion modules that call them are `backend/analyzer.py` (single-paper analysis) and `backend/extractors.py` (topic intelligence and relevance scoring). `backend/literature_review.py` calls `literature_review_prompt` directly.

---

## Table of Contents

1. [Gemini Integration](#1-gemini-integration)
2. [JSON Extraction Strategy](#2-json-extraction-strategy)
3. [Prompt Engineering Principles](#3-prompt-engineering-principles)
4. [Prompt 1 — Topic Expansion](#4-prompt-1--topic-expansion)
5. [Prompt 2 — Relevance Scoring](#5-prompt-2--relevance-scoring)
6. [Prompt 3 — Single Paper Deep Analysis](#6-prompt-3--single-paper-deep-analysis)
7. [Prompt 4 — Multi-Paper Cross-Synthesis](#7-prompt-4--multi-paper-cross-synthesis)
8. [Prompt 5 — Literature Review Generation](#8-prompt-5--literature-review-generation)

---

## 1. Gemini Integration

### Model

All prompts use `gemini-1.5-flash` via the `google-generativeai` Python SDK.

**Model configuration:**

```python
genai.GenerativeModel(
    model_name="gemini-1.5-flash",
    generation_config={
        "temperature": 0.2,
        "top_p": 0.9,
        "max_output_tokens": 4096
    }
)
```

**Why these settings:**

| Parameter | Value | Rationale |
|---|---|---|
| `temperature` | `0.2` | Low temperature reduces hallucination and keeps structured JSON output deterministic. Research analysis requires factual grounding, not creativity. |
| `top_p` | `0.9` | Mild nucleus sampling to avoid completely rigid outputs while still suppressing unlikely tokens. |
| `max_output_tokens` | `4096` | Literature reviews and multi-paper synthesis can approach this limit. Single-paper analysis typically uses 1500–2500 tokens. |

### API Key Management

The `GEMINI_API_KEY` environment variable is read at module load time in `_configure()`. The configuration call to `genai.configure()` is guarded by a `_configured` flag so it runs at most once per process lifetime (lazy singleton pattern). If the key is absent, `EnvironmentError` is raised immediately, causing `call_llm()` to propagate the exception to the caller, which then uses its fallback.

### SDK Call Pattern

```python
def call_llm(prompt: str, expect_json: bool = True):
    model = _get_model()
    response = model.generate_content(prompt)
    text = response.text.strip()
    if not expect_json:
        return text
    # ... JSON extraction (see Section 2)
```

The `expect_json=True` parameter is passed for every prompt in this codebase. The raw-text path (`expect_json=False`) exists for future use but is not currently called.

---

## 2. JSON Extraction Strategy

Every prompt instructs the model to return "ONLY a valid JSON object" or "ONLY a valid JSON array." In practice, models sometimes wrap output in markdown code fences (` ```json ... ``` `). The `call_llm()` function handles this with a two-stage extraction:

### Stage 1 — Strip Markdown Fences

```python
cleaned = re.sub(r"^```(?:json)?\s*", "", text)
cleaned = re.sub(r"\s*```$", "", cleaned).strip()
```

This removes leading ` ```json ` or ` ``` ` and trailing ` ``` ` blocks. The resulting `cleaned` string is then passed to `json.loads()`.

### Stage 2 — Regex JSON Extraction Fallback

If `json.loads()` raises `JSONDecodeError` (e.g., the model added explanatory prose before or after the JSON), a regex fallback is attempted:

```python
match = re.search(r"[\[{].*[\]}]", cleaned, re.DOTALL)
if match:
    return json.loads(match.group())
raise ValueError(f"Could not parse JSON:\n{text[:300]}")
```

This searches for the first `{...}` or `[...]` block in the text and attempts to parse it as JSON. This handles cases where the model writes a short sentence like "Here is the analysis:" before the JSON block.

### What Happens When Both Stages Fail

If both stages fail, `call_llm()` raises `ValueError`. Every caller wraps the `call_llm()` invocation in a `try/except Exception` block and falls back to a local non-LLM implementation:

| Caller | Fallback |
|---|---|
| `analyze_text()` in `analyzer.py` | `_fallback_analyze()` — regex pattern matching on the paper text |
| `expand_topic()` in `extractors.py` | Returns a safe default dict with the raw topic as the only query |
| `_get_llm_relevance_scores()` in `extractors.py` | `_keyword_relevance_scores()` — keyword overlap scoring |
| `generate_literature_review()` in `literature_review.py` | `_fallback_literature_review()` — sentence-pattern extraction from abstracts |
| `analyze_topic()` (combined synthesis) in `app.py` | `_merge_analyses()` — deduplicates and merges individual paper analyses |

---

## 3. Prompt Engineering Principles

All five prompts in this codebase share a set of deliberate engineering decisions. Understanding these principles is essential before modifying any prompt.

### 3.1 Role Assignment

Every prompt opens with a role declaration that sets epistemic expectations:

- `"You are a senior research analyst, not a summarizer."` — Explicitly forbids the summarization behavior that LLMs default to.
- `"You are a research librarian and academic search specialist."` — Signals that search query quality matters.
- `"You are a professor writing a formal academic literature review."` — Sets the register and rigor expected.

Role assignment alone shifts output quality significantly for structured analysis tasks.

### 3.2 Reasoning-Before-Output (Chain-of-Thought)

The two most complex prompts (single-paper analysis and multi-paper synthesis) embed an explicit numbered reasoning protocol before the output instruction. The model is told to "work through these questions internally before writing any output." This forces the model to build an internal representation of the paper's narrative before filling in structured fields, which reduces superficial or generic answers.

The protocols are framed as internal — the model does not output its reasoning steps, only the final JSON. This keeps responses compact while still benefiting from chain-of-thought reasoning.

### 3.3 Anti-Generic Rules

Every prompt contains explicit instructions that prohibit generic placeholder content. These rules are enforced at both the prompt level and the code level:

**Prompt-level (in `analyze_paper_prompt`):**
```
Do NOT generate generic statements like "future work could explore more datasets."
Instead: "The paper evaluates only on [specific dataset]; extending to [adjacent domain]
datasets such as [example] would test generalization of [specific component]."
```

**Code-level (in `_validate_and_normalize()` in `analyzer.py`):**

The validator maintains a `GENERIC_PHRASES` list:
```python
GENERIC_PHRASES = [
    "future work could explore",
    "more datasets",
    "larger models",
    "not explicitly stated",
    "no specific",
    "not available",
    "n/a",
]
```

Any list item in the LLM output that matches one of these phrases is filtered out. If filtering removes all items, the original unfiltered list is kept (to avoid empty arrays).

### 3.4 Evidence Grounding

Every analysis field is required to be grounded in specific evidence from the paper text:

- `results_and_findings` must include specific numbers (e.g., "94.3% accuracy, +2.1% over SOTA").
- `research_gaps` must each trace back to a specific evidence source (a limitation, a missing evaluation, a missing dataset).
- `ai_generated` future scope must "explain the reasoning chain, not just name a direction."
- `weaknesses` must be "what a peer reviewer would write, not what the authors admit."

This prevents the model from generating plausible-sounding but vacuous analytical text.

### 3.5 Structural Enforcement

Every prompt specifies the exact JSON schema the model must return, with field names, types, and example values embedded in the prompt string. The prompt does not describe the schema — it shows it, using a partially-filled template with instruction strings in place of values. This technique (schema-in-prompt) is more reliable than describing structure in prose.

### 3.6 Synthesis vs. Summarization

The multi-paper and literature review prompts explicitly distinguish synthesis from summarization:

```
Your task is NOT to summarize them one by one. Your task is to synthesize:
find patterns, contradictions, progressions, and collective insights that
NO single paper reveals on its own.
```

```
Do NOT write "Paper A proposes X. Paper B proposes Y." That is summarization,
not synthesis.
```

These rules prevent the most common failure mode for multi-document LLM tasks.

---

## 4. Prompt 1 — Topic Expansion

**Function:** `topic_expansion_prompt(topic: str) -> str`

**Location:** `backend/llm.py`

**Called by:** `expand_topic()` in `backend/extractors.py`, which is called at the start of `search_papers()`.

### Purpose

Transforms a raw user query (e.g., "retinal disease AI") into a structured search plan that drives the multi-source paper retrieval pipeline. Without this step, the retrieval would use the literal query string against all sources, yielding low-precision results.

### When Called

Once per `POST /analyze/topic` request, before any source is queried. The result drives all subsequent retrieval, deduplication, and relevance filtering in that request.

### Input Parameters

| Parameter | Type | Description |
|---|---|---|
| `topic` | `string` | The raw topic string from the user's request body |

The topic string is interpolated into the prompt twice: once in the opening context sentence and once at the end as `"Topic to analyse: "{topic}""`.

### Output JSON Schema

```json
{
  "canonical_topic": "Diabetic Retinopathy Detection using Deep Learning",
  "domain": "medical",
  "is_medical": true,
  "arxiv_categories": ["cs.CV", "eess.IV"],
  "search_queries": [
    "diabetic retinopathy detection deep learning convolutional neural network",
    "fundus image classification retinal lesion segmentation",
    "automated DR grading benchmark dataset evaluation",
    "clinical deployment retinopathy screening mobile ophthalmology",
    "survey deep learning ophthalmology retinal disease"
  ],
  "relevance_concepts": [
    "diabetic retinopathy grading or detection",
    "fundus photography or retinal imaging",
    "convolutional neural network or deep learning classifier",
    "benchmark dataset such as EyePACS IDRiD or Messidor",
    "lesion segmentation microaneurysm hemorrhage",
    "automated screening clinical validation"
  ],
  "rejection_signals": [
    "glaucoma detection without retinopathy mention",
    "age-related macular degeneration AMD",
    "general medical image segmentation not retina-specific"
  ]
}
```

### Field Constraints

| Field | Constraints |
|---|---|
| `domain` | Must be one of: `medical`, `computer_science`, `physics`, `biology`, `chemistry`, `engineering`, `mathematics`, `social_science`, `economics`, `other` |
| `is_medical` | Must be `true` if the topic involves clinical care, disease, anatomy, drugs, or diagnostics |
| `arxiv_categories` | Must be real, valid arXiv category codes (e.g., `cs.CV`, `cs.LG`, `eess.IV`, `q-bio.QM`). 2–4 categories maximum. |
| `search_queries` | Must be 5 items. Natural academic English phrases, not keyword lists. |
| `relevance_concepts` | Must be 6 items. Must be specific to the topic, not generic terms like "deep learning." |
| `rejection_signals` | Must be 3 items. Help filter papers that share keywords but are off-topic. |

### How the Output is Used

```python
queries           = topic_info["search_queries"]       # drives all source searches
categories        = topic_info["arxiv_categories"]     # passed to arXiv category filter
is_medical        = topic_info["is_medical"]           # gates PubMed search
canonical_topic   = topic_info["canonical_topic"]      # passed to relevance scoring prompt
relevance_concepts = topic_info["relevance_concepts"]  # passed to relevance scoring prompt
rejection_signals  = topic_info["rejection_signals"]   # passed to relevance scoring prompt
```

### Fallback Behaviour

If the LLM call fails or the response is missing any required key, `expand_topic()` returns:

```python
{
    "canonical_topic": topic,          # raw user input
    "domain": "other",
    "is_medical": _is_medical_fallback(topic),  # keyword check
    "arxiv_categories": ["cs.LG", "cs.AI"],
    "search_queries": [topic],         # single query, the raw topic
    "relevance_concepts": [topic],
    "rejection_signals": [],
}
```

The `_is_medical_fallback()` function checks for medical keywords (disease, clinical, patient, diagnosis, retinal, cancer, tumor, MRI, etc.) in the lowercased topic string. In fallback mode, only a single query is used per source, significantly reducing retrieval breadth.

---

## 5. Prompt 2 — Relevance Scoring

**Function:** `relevance_scoring_prompt(papers_json, relevance_concepts, rejection_signals, canonical_topic) -> str`

**Location:** `backend/llm.py`

**Called by:** `_get_llm_relevance_scores()` in `backend/extractors.py`.

### Purpose

Scores each candidate paper's relevance to the canonical topic on a 0–100 scale. This is the semantic relevance component (50% weight) of the composite ranking score. It enables the pipeline to distinguish papers that merely share keywords from papers that directly address the research topic.

### When Called

Once per `POST /analyze/topic` request, after multi-source retrieval and deduplication, before final ranking. The input is the full set of unique papers after deduplication (potentially 60–120 papers for a default `max_papers=10` request).

### Input Parameters

| Parameter | Type | Description |
|---|---|---|
| `papers_json` | `string` | JSON-serialized array of compact paper objects. Each has `index` (int), `title` (string), and `abstract` (first 400 characters only). |
| `relevance_concepts` | `list` | The `relevance_concepts` list from the topic expansion output. |
| `rejection_signals` | `list` | The `rejection_signals` list from the topic expansion output. |
| `canonical_topic` | `string` | The `canonical_topic` from topic expansion. |

The prompt formats `relevance_concepts` and `rejection_signals` as bullet lists and interpolates them into the scoring rubric.

### Scoring Rubric Embedded in Prompt

| Score Range | Meaning |
|---|---|
| 90–100 | Directly about the topic. Core concepts in title and abstract. |
| 70–89 | Closely related. Addresses 3–4 core concepts. |
| 50–69 | Relevant but tangential. Shares methodology or domain. |
| 20–49 | Partial overlap. Mentions keywords but is primarily about something else. |
| 0–19 | Not relevant. Also required if paper is primarily about rejection_signals content. |

### Output JSON Schema

```json
[
  {"index": 0, "score": 92, "reason": "Directly addresses diabetic retinopathy grading using CNNs on EyePACS dataset"},
  {"index": 1, "score": 45, "reason": "Uses deep learning for medical imaging but focuses on chest X-ray classification"},
  {"index": 2, "score": 12, "reason": "Primarily about glaucoma — a rejection signal topic"}
]
```

The array must be in the same order as the input `papers_json` array. `index` is the original paper index for mapping scores back to papers.

### How the Output is Used

The scores are stored in a `{paper_index: score}` dict. Each paper's semantic score drives 50% of the composite ranking formula:

```
composite = 0.50 * semantic_score
          + 0.25 * citation_score
          + 0.15 * recency_score
          + 0.10 * source_score
```

Papers with `composite < 20` (the `RELEVANCE_THRESHOLD`) are dropped entirely.

### Fallback Behaviour

If the LLM call fails, `_keyword_relevance_scores()` computes a lightweight fallback:

```
score = 50 + (concept_hits / n_concepts) * 50 - rejection_hits * 30
```

Where `concept_hits` is the number of `relevance_concepts` strings found in the paper's title+abstract, and `rejection_hits` is the number of `rejection_signals` strings found. The score is clamped to `[0, 100]`.

---

## 6. Prompt 3 — Single Paper Deep Analysis

**Function:** `analyze_paper_prompt(text: str) -> str`

**Location:** `backend/llm.py`

**Called by:** `analyze_text()` in `backend/analyzer.py`, which is called by every `/analyze/*` endpoint and for each individual paper in `POST /analyze/topic`.

### Purpose

Performs a deep research decomposition of a single paper — not a summary. The prompt is designed to make the model reason through the research narrative systematically before populating any output field.

### When Called

- `POST /analyze/text` — directly on the provided text
- `POST /analyze/pdf` — on text extracted from the uploaded PDF
- `POST /analyze/pdfs` — once per successfully parsed PDF
- `POST /analyze/url` — on text scraped from the URL
- `POST /analyze/topic` — once per paper, on the paper's abstract (the abstract is the only text available from the retrieval sources)

### Input Parameters

| Parameter | Type | Description |
|---|---|---|
| `text` | `string` | Paper text. Only the first 7000 characters are passed to the prompt (`text[:7000]`). |

The 7000-character limit is a hard truncation in the prompt string itself. For PDF and URL sources, the full extracted text is passed to `analyze_text()`, but only the first 7000 characters reach Gemini. For topic-mode papers, the abstract is typically 150–400 characters, well within the limit.

### 10-Question Internal Reasoning Protocol

Before generating any output, the model is instructed to work through these questions internally:

1. What specific problem does this paper address? Why does it matter?
2. What gap in prior work motivates this paper? Is it stated explicitly or implied?
3. What is the core methodological contribution? What makes it novel?
4. What datasets were used? Are they standard benchmarks or custom?
5. How is performance evaluated? What metrics? Compared against what baselines?
6. What do the results actually show? Are the improvements significant?
7. What does the paper itself admit it cannot do or does poorly?
8. What would a rigorous peer reviewer criticize?
9. What future work do the authors explicitly suggest?
10. What future work is implied by the gaps and limitations but NOT stated by the authors?

Questions 7–10 are the most important for research gap identification. They force the model to distinguish between what the authors admit (Q7, Q9) and what an external analyst would identify (Q8, Q10).

### Output JSON Schema

The full schema is the [Analysis Object](#analysis-object) defined in `api-reference.md`. Key structural decisions:

- `research_gaps` is a **dict** (not a flat list) with 6 typed sub-arrays, each tracing gaps to a specific evidence type. This prevents the model from generating generic "more research is needed" filler.
- `future_scope` is split into `author_suggested` and `ai_generated`. The model must attribute each direction to its source.
- `keywords` is a scored list of `{term, score}` objects, not a flat string list.

### Post-Processing in `analyze_text()`

After `call_llm()` returns the parsed JSON, `analyzer.py` performs:

1. **`_validate_and_normalize(result, text)`** — Ensures every required key exists with a non-empty value. Replaces missing or generic content with defaults. Validates nested object shapes (`methodology`, `evaluation`, `research_gaps`, `future_scope`). If `keywords` is empty or missing, runs `_fallback_keywords(text)` which computes TF-weighted unigrams and bigrams from the text.

2. **Stats computation** — `compute_stats(text)` is called on the original text (not the truncated version). It counts words, sentences (≥30 characters), average sentence length, and unique words.

3. **Legacy field injection** — Five flat alias fields are set via `.setdefault()` so they do not overwrite any fields the LLM happened to include under those names: `summary`, `important_sentences`, `contributions`, `methods`, `evaluation_metrics`.

4. **Flat gap and scope arrays** — `research_gaps_flat` (all six sub-arrays concatenated) and `future_scope_flat` (`author_suggested` + `ai_generated` concatenated) are added for UI backward compatibility.

### Fallback Behaviour

If `call_llm()` raises any exception, `_fallback_analyze(text, stats)` is called. This function:

- Splits text into sentences using `(?<=[.!?])\s+` regex.
- Uses `extract_by_phrases()` with keyword lists to populate each structured field from sentences that contain relevant trigger phrases (e.g., `"we propose"`, `"limitation"`, `"future work"`).
- Computes `_fallback_keywords()` using frequency-weighted unigrams and bigrams.
- Returns a complete analysis object with all required keys, but with significantly lower accuracy than the LLM path.

---

## 7. Prompt 4 — Multi-Paper Cross-Synthesis

**Function:** `multi_paper_analysis_prompt(papers_text: str, topic: str) -> str`

**Location:** `backend/llm.py`

**Called by:** `analyze_topic()` in `backend/app.py`, after all individual papers have been analyzed.

### Purpose

Generates a cross-paper synthesis — identifying patterns, contradictions, progressions, and collective insights that no single paper reveals on its own. This is explicitly not a sequential summary of individual papers.

### When Called

Once per `POST /analyze/topic` request, after all individual paper analyses are complete. The input is constructed from the individual paper analyses, not from raw abstracts.

### Input Parameters

| Parameter | Type | Description |
|---|---|---|
| `papers_text` | `string` | A structured text block containing one entry per paper, each with: Title, Authors, Year, Source, Citations, Summary, Key Contributions, Methods Used, Research Gaps, Limitations, Future Scope. Entries are separated by `---`. Only the first 10000 characters are passed to the prompt (`papers_text[:10000]`). |
| `topic` | `string` | The original topic string. Used in the opening context line. |

**Input construction in `app.py`:**

```python
block = (
    f"Title: {r['title']}\n"
    f"Authors: {', '.join(r.get('authors', []))}\n"
    f"Year: {r.get('year', ...)}\n"
    f"Source: {r.get('source', '')} | Citations: {r.get('citations', 0)}\n"
    f"Summary: {summary}\n"
    f"Key Contributions: {contribs}\n"   # first 3 from individual analysis
    f"Methods Used: {methods}\n"
    f"Research Gaps: {gaps}\n"
    f"Limitations: {limits}\n"
    f"Future Scope: {future}"
)
```

This design sends already-analyzed structured content to the synthesis prompt rather than raw abstracts, which allows the synthesis to operate on pre-extracted concepts rather than raw text.

### 8-Question Synthesis Protocol

The model is instructed to reason through these before writing output:

1. What methodological families appear across papers? Which dominates? Why?
2. Which datasets appear repeatedly? Which papers use unique datasets — and why?
3. Where do evaluation protocols differ? What does that inconsistency mean?
4. Where do papers agree on findings? Where do they contradict each other?
5. What problem does every paper struggle with (recurring limitation)?
6. What gap does no paper address — not even partially?
7. What is the trajectory of the field: what has improved, what is stagnating?
8. What would a meta-reviewer conclude about the maturity of this research area?

Q4 is specifically designed to surface `areas_of_disagreement`, which is the most difficult field to populate correctly. Q6 targets the `recurring_research_gaps` that do not appear in any single paper but emerge from the collection. Q8 drives `field_maturity_assessment`.

### Output JSON Schema

See [Combined Synthesis Fields in api-reference.md](./api-reference.md#combined-synthesis-fields) for the full field list. Key design decisions:

- `synthesis_summary` is explicitly prohibited from reading as a list. The prompt rule is: "Must reference specific papers by title or finding. Must state what the field collectively knows, where it disagrees, and what remains unsolved."
- `areas_of_disagreement` is required to have at least one entry if papers have any conflicting findings.
- `future_research_opportunities` must trace back to specific evidence (gaps, limitations, disagreements) — not be generic.
- `field_maturity_assessment` is one paragraph, not a list.

### Fallback Behaviour

If `call_llm()` raises any exception in `app.py`'s `analyze_topic()`, the `_merge_analyses(results, topic)` function is used. It:

- Deduplicates and merges all list fields from individual paper analyses using a case-insensitive 60-character prefix set.
- Takes the top 12 keywords by score across all papers.
- Concatenates abstracts for `compute_stats()`.
- Returns a flat dict with: `title`, `summary`, `keywords`, `research_gaps`, `limitations`, `future_scope`, `contributions`, `methods`, `important_sentences`, `stats`.

The fallback does not produce `synthesis_summary`, `common_themes`, `method_comparison`, or any of the synthesis-specific fields. The UI must handle the structural difference.

---

## 8. Prompt 5 — Literature Review Generation

**Function:** `literature_review_prompt(papers_json: str, topic: str) -> str`

**Location:** `backend/llm.py`

**Called by:** `generate_literature_review()` in `backend/literature_review.py`, which is called by `POST /api/literature-review`.

### Purpose

Generates a complete formal 8-section academic literature review as structured HTML sections. The review must read as a unified scholarly argument, not as a sequence of paper summaries.

### When Called

When `POST /api/literature-review` is called with a list of papers. It is the only prompt called from `literature_review.py`.

### Input Parameters

| Parameter | Type | Description |
|---|---|---|
| `papers_json` | `string` | JSON-serialized array of enriched paper objects. Only the first 9000 characters are passed to the prompt (`papers_json[:9000]`). |
| `topic` | `string` | The research topic for the review title and conclusion. |

**Input construction in `generate_literature_review()`:**

Each paper in the input array is pre-processed to a compact dict with: `title`, `authors` (first 3), `published` (year only), `abstract` (first 500 characters), `url`, and these analysis-derived fields if a pre-computed `analysis` is attached to the paper: `research_problem`, `main_contribution`, `methodology` (overview string), `datasets` (first 3 names), `key_results` (first 2), `limitations` (first 2), `research_gaps` (flat, first 2).

This means papers analyzed via `POST /analyze/topic` before being passed to this endpoint will produce significantly richer literature reviews than papers with only `title` and `abstract`.

### Writing Protocol Embedded in Prompt

```
- Each section must advance an argument or reveal a pattern.
- Cite papers by author/year inline (e.g., "Smith et al. (2023) demonstrate...").
- Identify tensions, progressions, and unresolved questions across the field.
- The review must be useful to a researcher who wants to understand the field landscape.
```

### Output JSON Schema

All eight section values are **HTML strings**, not plain text. The prompt shows each section as an HTML template with `<h2>`, `<h3>`, `<p>`, and `<ul><li>` elements. The model is expected to return valid HTML for each section that can be rendered directly in the React frontend.

```json
{
  "introduction": "<h2>1. Introduction</h2><p>...</p>",
  "background": "<h2>2. Background</h2><p>...</p>",
  "thematic_analysis": "<h2>3. Thematic Analysis</h2><h3>3.1 Theme Name</h3><p>...</p>",
  "methodology_comparison": "<h2>4. Methodology Comparison</h2><p>...</p>",
  "dataset_comparison": "<h2>5. Dataset & Evaluation Landscape</h2><p>...</p>",
  "research_trends": "<h2>6. Research Trends</h2><p>...</p>",
  "conclusion_and_gaps": "<h2>7. Research Gaps, Limitations & Future Directions</h2>...",
  "conclusion": "<h2>8. Conclusion</h2><p>...</p>",
  "themes": ["Theme 1", "Theme 2", "Theme 3"],
  "common_gaps": ["Evidence-based gap 1", "Gap 2"],
  "common_limitations": ["Recurring limitation 1", "Limitation 2"],
  "future_suggestions": ["Specific future direction 1", "Direction 2"],
  "summary_table": [
    {
      "title": "Paper title",
      "authors": "Last et al. (2023)",
      "research_problem": "...",
      "contribution": "...",
      "methodology": "...",
      "datasets": "...",
      "key_results": "...",
      "limitations": "...",
      "url": ""
    }
  ]
}
```

### Section-Specific Rules Embedded in Prompt

| Section | Key Rule |
|---|---|
| `introduction` | Must state the number of papers reviewed and the time span covered. Must introduce key themes to be examined. |
| `thematic_analysis` | Must NOT summarize papers sequentially. Must compare and synthesize. Must reference at least 2 papers per theme. |
| `conclusion_and_gaps` | Must include Research Gaps (`<h3>7.1`), Common Limitations (`<h3>7.2`), and Future Research Directions (`<h3>7.3`) as nested HTML sub-sections with `<ul><li>` items. |
| `summary_table` | Must include all columns: `research_problem`, `datasets`, `key_results`, `limitations`. URL field is injected post-generation from the original paper objects. |
| `future_suggestions` | Must be specific and actionable. Generic phrases like "more data" or "larger models" are prohibited by the prompt rules. |

### Post-Processing in `generate_literature_review()`

After the LLM returns:

1. **URL injection into summary table** — The LLM often returns empty `url` fields in `summary_table`. The code patches each row with the corresponding paper's URL from the original input list, matched by position.

2. **Per-section fallback** — Each section is checked: if the LLM returned an empty string or `None` for a section, a locally generated fallback is used. Sections with rich fallbacks: `introduction`, `background`, `thematic_analysis`, `conclusion_and_gaps`. Sections that fall back to empty string: `methodology_comparison`, `dataset_comparison`, `research_trends`, `conclusion`.

3. **List field capping** — `common_gaps` is capped at 6 items, `common_limitations` at 5, `future_suggestions` at 6.

4. **Summary table preference** — If the LLM returned a non-empty `summary_table`, it is used. Otherwise, the pre-built `_build_summary_table()` fallback is used. The fallback table is built before the LLM call and uses analysis fields where available, falling back to sentence pattern matching on abstracts.

### Fallback Behaviour

If `call_llm()` raises any exception, `_fallback_literature_review()` is called. This function:

- Calls `_fallback_intro()`, `_fallback_background()`, `_fallback_thematic()`, and `_fallback_conclusion()` to generate minimal HTML for the four sections that have fallback generators.
- Sets `methodology_comparison`, `dataset_comparison`, `research_trends`, and `conclusion` to empty strings.
- Extracts `common_gaps`, `common_limitations`, and `future_suggestions` by scanning paper abstracts for phrase-trigger sentences (e.g., "gap in", "limitation", "future work").
- Uses the pre-built `summary_table` from `_build_summary_table()`.

The fallback produces a structurally complete response (no missing keys) but the section content quality is significantly lower than the LLM path.
