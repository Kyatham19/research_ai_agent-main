# Master TODO List

This is the single authoritative checklist of all open work items for the Research AI Agent project. Items are sourced from [BUGS.md](BUGS.md), [PENDING-WORK.md](PENDING-WORK.md), and [ENHANCEMENTS.md](ENHANCEMENTS.md).

**Instructions:**
- Check off items as they are completed: change `[ ]` to `[x]`.
- When an item is done, also update the source file (remove the bug row, update the pending-work status, or remove the enhancement row) and add a CHANGELOG.md entry.
- Items marked with a blocking note should be resolved before dependent features are implemented.
- Do not delete completed items from this file — checked items serve as a lightweight changelog until moved to CHANGELOG.md.

---

## High Priority

### Bug Fixes

- [ ] **[BUG] No error shown when workspace creation fails silently** — `InputPage.jsx` swallows the workspace creation error and continues analysis without a workspace ID, causing results to be lost on refresh. Show an error in the UI and block analysis from proceeding without a valid workspace. (`frontend/src/pages/InputPage.jsx`, `backend/app.py`)

- [ ] **[BUG] LLM JSON parsing fails on large papers** — `analyze_paper_prompt` truncates paper text at 7,000 characters, which can cause Gemini to return incomplete or malformed JSON that the regex fallback cannot recover. Raise the limit or implement chunked analysis with summarisation. (`backend/analyzer.py`)

- [ ] **[BUG] arXiv category fallback too narrow for non-CS topics** — The hardcoded fallback `["cs.LG", "cs.AI"]` returns zero results for topics outside computer science. Broaden the fallback or make it configurable per query. (`backend/analyzer.py`, `backend/extractors.py`)

- [ ] **[BUG] Venv path hardcoded to original machine** — If the venv directory is present in version control or copied between machines, `pyvenv.cfg` points to a non-existent Python path. Document and enforce that `venv/` is gitignored and must be recreated locally. (`backend/venv/pyvenv.cfg`, `.gitignore`)

### Features (blocking or high-impact)

- [ ] **[PENDING] Literature review saves to workspace** — `generate_literature_review()` accepts `workspace_id` but never persists the result. Wire it up so literature reviews are written to the workspace and survive page refresh. (`backend/app.py`, `backend/analyzer.py`, `backend/storage.py`)

- [ ] **[PENDING] Auth / multi-user support** — No authentication exists; all workspaces are globally accessible. Required before any deployment beyond a single trusted user on localhost. (`backend/app.py`, `backend/storage.py`, `frontend/src/App.jsx`)

---

## Medium Priority

### Bug Fixes

- [ ] **[BUG] `_mode` not always set on workspace reload** — Old workspaces missing `mode` in `metadata.json` cause `ResultsPage.jsx` to render the wrong template. Add a `mode` default in the workspace loader on both backend and frontend. (`backend/data/workspaces/*/metadata.json`, `frontend/src/pages/ResultsPage.jsx`, `frontend/src/components/Sidebar.jsx`)

- [ ] **[BUG] PubMed rate limiting without NCBI API key** — Without an API key the rate limit is 3 req/s; the 0.35 s sleep is insufficient under load. Add `NCBI_API_KEY` environment variable support to raise the limit to 10 req/s. (`backend/extractors.py`)

- [ ] **[BUG] OpenAlex abstract_inverted_index edge case** — Some OpenAlex responses have `None` or empty `abstract_inverted_index`; the paper is skipped entirely instead of being included without an abstract. Fix `_reconstruct_abstract()` to degrade gracefully. (`backend/extractors.py`)

### Features

- [ ] **[PENDING] Chat UI** — The `POST /api/workspaces/<wid>/chat` backend endpoint exists and `chat.json` is stored, but no frontend chat interface exists. Implement a chat panel in `ResultsPage.jsx` wired to the existing endpoint. (`frontend/src/pages/ResultsPage.jsx`, `frontend/src/components/Sidebar.jsx`)

- [ ] **[PENDING] ideas.json feature** — `storage.py` creates `ideas.json` per workspace and has `save_ideas()`, but no route or UI uses it. Add a `/api/workspaces/<wid>/ideas` route and a "Generate Research Ideas" panel in the frontend. (`backend/app.py`, `backend/analyzer.py`, `backend/storage.py`, `frontend/src/pages/ResultsPage.jsx`)

- [ ] **[PENDING] Persistent Gemini chat context** — Chat history is stored but not included in subsequent Gemini calls. Load chat history from `chat.json` and pass it as the `contents` array on each chat request. (`backend/app.py`, `backend/analyzer.py`)

- [ ] **[ENHANCEMENT] Export analysis as PDF / Word / BibTeX** — Allow users to export full analysis results or citation lists from the results page. (`backend/app.py`, `frontend/src/pages/ResultsPage.jsx`)

- [ ] **[PENDING] Wire up @dnd-kit for paper reordering** — `@dnd-kit/core` and `@dnd-kit/sortable` are installed but unused. Implement drag-and-drop paper ordering in the literature review selector. (`frontend/src/pages/ResultsPage.jsx`)

- [ ] **[PENDING] Rate limiting on API endpoints** — Flask routes have no rate limiting; the Gemini API key can be exhausted by any client. Add Flask-Limiter or configure a reverse-proxy rate limit. (`backend/app.py`, `backend/requirements.txt`)

---

## Low Priority / Future

### Bug Fixes

- [ ] **[BUG] pymupdf not installable on Python 3.14** — No official wheel for Python 3.14; source build fails. When an official wheel is published, add `pymupdf` back to `requirements.txt` for faster, more accurate PDF parsing. (`backend/requirements.txt`, `backend/extractors.py`)

- [ ] **[PENDING] Workspace list pagination** — `list_workspaces()` loads all workspaces on every sidebar open; no limit/offset exists. Add pagination to `GET /api/workspaces` and update the sidebar to load incrementally. (`backend/storage.py`, `backend/app.py`, `frontend/src/components/Sidebar.jsx`)

- [ ] **[PENDING] Custom favicon and app metadata** — Replace the default Vite favicon and `<title>`. Add Open Graph `<meta>` tags for link previews. (`frontend/index.html`, `frontend/public/`)

### Features

- [ ] **[ENHANCEMENT] RAG chat with workspace papers using Gemini** — Full RAG pipeline: embed papers, retrieve relevant chunks on each chat turn, include chunks in Gemini context. Requires a vector store or embedding service. (`backend/app.py`, `backend/analyzer.py`)

- [ ] **[ENHANCEMENT] Paper recommendation engine** — Use Semantic Scholar or OpenAlex recommendations API to suggest related papers based on the current workspace's paper set. (`backend/extractors.py`, `backend/app.py`, `frontend/src/pages/ResultsPage.jsx`)

- [ ] **[ENHANCEMENT] Scheduled topic monitoring with notifications** — Let users subscribe to a topic and receive email/webhook alerts when new matching papers are published. Requires a background scheduler (APScheduler) and notification delivery. (`backend/app.py`, `backend/extractors.py`)

- [ ] **[ENHANCEMENT] Collaborative workspaces** — Shareable read-only or read-write workspace links using token-based URLs. Requires auth layer as a prerequisite. (`backend/app.py`, `backend/storage.py`)

- [ ] **[ENHANCEMENT] Citation graph visualization** — Visualize inter-paper citation relationships using DOI cross-reference data from Semantic Scholar. Render in the frontend with D3.js or react-force-graph. (`backend/extractors.py`, `frontend/src/pages/ResultsPage.jsx`)

- [ ] **[ENHANCEMENT] Scanned PDF support via OCR** — Add Tesseract OCR (pytesseract) as a fallback for PDFs that contain only images. (`backend/extractors.py`, `backend/requirements.txt`)

- [ ] **[ENHANCEMENT] Pluggable paper source system** — Refactor the four hardcoded extractors into a plugin interface so new academic databases can be added without modifying core code. (`backend/extractors.py`, `backend/app.py`)
