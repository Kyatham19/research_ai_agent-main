# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Research Assistant that retrieves, analyzes, and synthesizes academic papers using Gemini as the LLM backbone. Flask serves both the API and the built React frontend as a single-origin app.

## Development Commands

### Backend
```bash
cd backend
# Install dependencies (venv already exists at backend/venv/)
pip install -r requirements.txt

# Run dev server
python app.py
# Runs on http://localhost:5000
```

### Frontend
```bash
cd frontend
npm install
npm run dev        # Vite dev server on http://localhost:5173
npm run build      # Build to frontend/dist/ (served by Flask in production)
npm run preview    # Preview the production build
```

### Full-stack production
The Flask server serves the built frontend from `frontend/dist/`. Build the frontend first, then run `python app.py`.

## Environment Setup

`backend/.env` must contain:
```
GEMINI_API_KEY=<your key>
```

The app loads this via `python-dotenv` at startup. The `/health` endpoint reports whether the key is configured.

## Architecture

### Backend (`backend/`)

Six Python modules with clear separation of concerns:

- **[app.py](backend/app.py)** — Flask entry point. Routes only; all logic delegated to other modules. Also serves the built React app from `../frontend/dist`.
- **[llm.py](backend/llm.py)** — Gemini wrapper (`gemini-2.5-flash`, temp=0.2). All prompts live here as functions: `topic_expansion_prompt`, `relevance_scoring_prompt`, `paper_combined_prompt`, `multi_paper_analysis_prompt`, `literature_review_prompt`. `call_llm()` handles JSON extraction from model output. `paper_combined_prompt` is a single combined call that replaces the old two-stage understand+analyze pipeline, halving LLM calls per paper.
- **[extractors.py](backend/extractors.py)** — Multi-source paper retrieval pipeline. `search_papers()` runs: topic expansion via LLM → parallel search across arXiv, Semantic Scholar, OpenAlex, PubMed → deduplication → LLM relevance scoring → composite ranking. PDF extraction uses PyMuPDF with pdfminer fallback. URL extraction handles arXiv pages specially.
- **[analyzer.py](backend/analyzer.py)** — Paper analysis. `analyze_text()` uses the single `paper_combined_prompt` via Gemini, validates/normalizes the result, and provides a regex-based `_fallback_analyze()` when LLM is unavailable. Maintains legacy flat keys alongside the structured output for UI backward compatibility.
- **[literature_review.py](backend/literature_review.py)** — Generates structured academic literature reviews via `generate_literature_review()`. Falls back to regex-based section generation if LLM fails.
- **[paper_draft.py](backend/paper_draft.py)** — Generates full research paper drafts via `generate_paper_draft()`. Accepts papers, title, research question, methodology, contributions, target venue, and selected sections. Caps at 2 reference papers to stay within free-tier token limits. Returns HTML-formatted sections.
- **[storage.py](backend/storage.py)** — File-based persistence. Each workspace is a folder at `backend/data/workspaces/workspace_<8char-id>/` containing `metadata.json`, `papers.json`, `analyses.json`, `ideas.json`, `chat.json`, `combined.json` (multi-paper combined analysis), and an `uploads/` directory for PDF binaries. `save_combined(wid, dict)` persists the combined analysis separately; `load_workspace()` returns it under the `combined` key.

### API Routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/analyze/topic` | Full pipeline: expand topic → fetch papers → analyze each → synthesize combined |
| POST | `/analyze/pdf` | Upload single PDF → extract text → analyze |
| POST | `/analyze/pdfs` | Upload multiple PDFs → analyze each + combined |
| POST | `/analyze/url` | Fetch URL → extract text → analyze |
| POST | `/analyze/text` | Analyze raw text directly |
| POST | `/api/literature-review` | Generate literature review from list of papers |
| POST | `/api/paper-draft` | Generate full paper draft from selected papers + config |
| GET/POST/DELETE | `/api/workspaces` | Workspace CRUD |
| GET | `/api/workspaces/<wid>` | Load full workspace (papers, analyses, chat) |
| POST | `/api/favorite/<wid>` | Toggle favorite |
| POST | `/api/workspaces/<wid>/chat` | Append chat message |

### Frontend (`frontend/src/`)

React 18 + Vite. No routing library — view state (`home` / `results` / `literature` / `draft`) managed in `App.jsx`. Theme persisted to `localStorage` via `data-theme` attribute.

- **[App.jsx](frontend/src/App.jsx)** — Root: owns all global state (`results`, `mode`, `view`, `currentWorkspaceId`, `theme`). `handleResults()` is the single callback that transitions to results view.
- **[pages/Inputpage.jsx](frontend/src/pages/Inputpage.jsx)** — Input form with mode tabs (topic / PDF / URL / text). Makes fetch calls to Flask API.
- **[pages/ResultsPage.jsx](frontend/src/pages/ResultsPage.jsx)** — Displays analysis output. Branches on `results._mode` to show topic multi-paper view vs. single-paper view.
- **[pages/LiteratureReview.jsx](frontend/src/pages/LiteratureReview.jsx)** — Literature review interface, fetches from `/api/literature-review`. All sections and the summary table are editable in-browser via `contentEditable` (ref-based pattern to avoid React reconciliation cursor resets).
- **[pages/PaperDraft.jsx](frontend/src/pages/PaperDraft.jsx)** — 3-phase paper draft builder: workspace picker → configuration form (title, research question, methodology, contributions, venue, section checkboxes) → editable draft with tab navigation and export to PDF/Word.
- **[components/Sidebar.jsx](frontend/src/components/Sidebar.jsx)** — Workspace list, favorite toggle, theme switcher. Navigation items: Home, Literature Reviews, Paper Drafts.

### Retrieval Pipeline Detail

`search_papers()` in `extractors.py` uses `ThreadPoolExecutor` to search all four sources concurrently. Relevance composite score: `0.50 * semantic + 0.25 * citation + 0.15 * recency + 0.10 * source`. Papers scoring below `RELEVANCE_THRESHOLD = 20` are dropped. Source authority order: PubMed (90) > Semantic Scholar (75) > OpenAlex (70) > arXiv (60).

PubMed queries are combined with OR into a single `esearch`+`efetch` call (instead of one call per query) to reduce latency.

### Parallel Paper Analysis

`/analyze/topic` analyzes each retrieved paper concurrently via `ThreadPoolExecutor(max_workers=3)` in `app.py`. Order is preserved using an index map (`futures = {submit(fn, p): i for i, p in enumerate(papers)}`). Per-paper failures are caught and logged; the request only fails if every paper fails.

`_merge_str_lists(*lists)` (module-level in `app.py`) deduplicates string lists using the first-60-char key — used by the `_merge_analyses()` fallback when the multi-paper LLM synthesis call fails.

### Data Shape

`analyze_text()` returns two parallel representations of the same data:
- **Structured** (new): `research_gaps` dict with `from_limitations`, `from_missing_datasets`, etc.; `future_scope` dict with `author_suggested` / `ai_generated`.
- **Flat/legacy** (backward compat): `research_gaps_flat`, `future_scope_flat`, `summary`, `contributions`, `methods` — retained so existing UI components don't break.

When adding new analysis fields, maintain both representations.

All backend code that builds `paper_blocks` or calls `_merge_analyses` must use the `_flat` keys (`research_gaps_flat`, `future_scope_flat`), never the structured dict keys directly.

### Frontend Data Normalization

`normalizeAnalysis(a)` in `App.jsx` ensures every analysis object has `research_gaps_flat` and `future_scope_flat` arrays, backfilling from the structured keys when the data was written before the refactor. `normalizeTopicResult(data)` applies this to combined + all individual papers in a topic result. Both are called in `handleResults()` (fresh API responses) and `handleSelectWorkspace()` (workspace loads), so all display paths are covered.

## Testing

### Backend Unit Tests

```bash
cd backend
venv\Scripts\python.exe -m unittest tests/test_backend.py -v
# 101 tests, all pass
```

Coverage: `compute_stats`, `clean_text`, `_fallback_keywords`, `storage` (create/save/load/delete/favorite/combined), `app._merge_str_lists`, `app._merge_analyses`, Flask routes via `test_client()`. Uses `tempfile.mkdtemp()` + teardown cleanup; stubs heavy deps (`google.generativeai`, `fitz`, `pdfminer`, etc.) via `sys.modules`.

### E2E Tests (Playwright)

```bash
cd tests
npx playwright test                                   # 167 mocked tests (~6 min)
npx playwright test e2e/13-integration.spec.js        # integration (requires GEMINI_API_KEY + running backend)
```

Tests run against `http://localhost:3000` (Vite dev server) with `page.route()` API mocking. See `tests/TEST-REPORT.md` for the full test inventory.
