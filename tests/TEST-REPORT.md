# Test Report — Research AI Agent

**Generated:** 2026-06-14 21:00:00 UTC  
**Node:** v24.16.0  
**Playwright:** v1.60.0  
**Platform:** Windows_NT 10.0.26200  

---

## Summary

| Metric | Value |
|--------|-------|
| Total tests | 222 |
| Passed | **222** |
| Failed | 0 |
| Skipped | 0 |
| Duration | ~7.5 min |
| Browser | Chromium (Desktop Chrome) |
| Base URL | http://localhost:3000 |

> Integration tests (13-integration.spec.js) excluded — require live Gemini API key.

---

## Coverage by Spec File

| # | Spec File | Tests | Status |
|---|-----------|-------|--------|
| 01 | 01-health.spec.js | 2 | ✅ All passed |
| 02 | 02-navigation.spec.js | 9 | ✅ All passed |
| 03 | 03-topic-search.spec.js | 9 | ✅ All passed |
| 04 | 04-pdf-upload.spec.js | 8 | ✅ All passed |
| 05 | 05-url-analysis.spec.js | 5 | ✅ All passed |
| 06 | 06-text-analysis.spec.js | 6 | ✅ All passed |
| 07 | 07-results-page.spec.js | 10 | ✅ All passed |
| 08 | 08-workspace-crud.spec.js | 9 | ✅ All passed |
| 09 | 09-sidebar.spec.js | 8 | ✅ All passed |
| 10 | 10-literature-review.spec.js | 10 | ✅ All passed |
| 11 | 11-theme.spec.js | 7 | ✅ All passed |
| 12 | 12-error-states.spec.js | 11 | ✅ All passed |
| 14 | 14-results-content.spec.js | 27 | ✅ All passed |
| 15 | 15-papers-and-compare.spec.js | 26 | ✅ All passed |
| 16 | 16-loading-states.spec.js | 12 | ✅ All passed |
| 17 | 17-input-edge-cases.spec.js | 10 | ✅ All passed |
| 18 | 18-workspace-ui-flow.spec.js | 11 | ✅ All passed |
| 19 | 19-multi-pdf-results.spec.js | 8 | ✅ All passed |
| 20 | 20-literature-review-builder.spec.js | 19 | ✅ All passed |
| 21 | 21-network-errors.spec.js | 9 | ✅ All passed |

---

## New Coverage Added (This Session)

### 14-results-content.spec.js (27 tests)

**Results Content — Topic Combined View (15 tests)**

| Test | Status |
|------|--------|
| summary-text is rendered and non-empty | ✅ |
| keyword chips are rendered | ✅ |
| keyword chips show term text | ✅ |
| Research Gaps section is open by default | ✅ |
| Research Gaps section contains items | ✅ |
| Limitations section is open by default | ✅ |
| Limitations section contains items | ✅ |
| Future Scope section is open by default | ✅ |
| Future Scope section contains items | ✅ |
| Methods section opens and shows method pills | ✅ |
| Contributions section opens and shows items | ✅ |
| Key Sentences section opens and shows items | ✅ |
| section count badges are shown for open sections | ✅ |
| stats row shows combined word count (14,400) | ✅ |
| stats row shows sentence count | ✅ |

**Results Content — Single Paper Mode / Text Analysis (12 tests)**

| Test | Status |
|------|--------|
| no view tabs rendered in single-paper mode | ✅ |
| summary-text is visible and non-empty | ✅ |
| keyword chips are rendered | ✅ |
| Research Gaps section is open and has items | ✅ |
| Limitations section is open and has items | ✅ |
| Future Scope section is open and has items | ✅ |
| stats row shows single-paper word count (7,200) | ✅ |
| stat cards show Words/Sentences/Unique words labels | ✅ |
| sections can be closed by clicking header | ✅ |
| closed section reopens on header click | ✅ |

### 15-papers-and-compare.spec.js (34 tests)

**Papers Tab — Card Content (18 tests)**

| Test | Status |
|------|--------|
| first paper card shows correct title | ✅ |
| first paper card shows authors | ✅ |
| first paper card shows summary text | ✅ |
| first paper card shows keyword tags | ✅ |
| first paper card shows research gaps badge | ✅ |
| second paper card shows different title | ✅ |
| paper card has arXiv link with correct href | ✅ |
| arXiv link opens in new tab | ✅ |
| expand button reveals paper details | ✅ |
| expanded details show Research Gaps block | ✅ |
| expanded details show Limitations block | ✅ |
| expanded details show Future Scope block | ✅ |
| expanded details show Methods block | ✅ |
| expanded Research Gaps block contains items | ✅ |
| expanded Methods block shows method pills | ✅ |
| expand button text changes to hide after click | ✅ |
| clicking expand button again hides details | ✅ |
| both paper cards have expand buttons | ✅ |

**Compare Tab — Table Content (16 tests)**

| Test | Status |
|------|--------|
| compare table has Title column header | ✅ |
| compare table has Authors column header | ✅ |
| compare table has Year column header | ✅ |
| compare table has Research Gaps column header | ✅ |
| compare table has Limitations column header | ✅ |
| compare table has Future Scope column header | ✅ |
| first row title cell shows paper title | ✅ |
| first row author cell shows author name | ✅ |
| first row year cell shows publication year | ✅ |
| first row keywords cell shows mini-pills | ✅ |
| badges show Yes for papers with research gaps | ✅ |
| badges show Yes for papers with limitations | ✅ |
| badges show Yes for papers with future scope | ✅ |
| compare table has arXiv links | ✅ |
| section header shows correct paper count | ✅ |

### 16-loading-states.spec.js (12 tests)

**Loading States — Topic Search (3 tests)**

| Test | Status |
|------|--------|
| submit button is disabled while searching | ✅ |
| spinner is visible while searching | ✅ |
| button re-enables after search completes | ✅ |

**Loading States — Text Analysis (3 tests)**

| Test | Status |
|------|--------|
| analyze button is disabled while analyzing text | ✅ |
| spinner is visible while analyzing text | ✅ |
| button shows Analyzing... text while loading | ✅ |

**Loading States — URL Analysis (3 tests)**

| Test | Status |
|------|--------|
| analyze button is disabled while fetching URL | ✅ |
| spinner is visible while fetching URL | ✅ |
| button shows Fetching... text while loading | ✅ |

**Loading States — PDF Upload (3 tests)**

| Test | Status |
|------|--------|
| analyze button is disabled while processing PDF | ✅ |
| spinner is visible while processing PDF | ✅ |
| button shows Analyzing... text while loading | ✅ |

---

## Coverage Summary

| Feature Area | Covered By |
|---|---|
| Backend health check | 01-health |
| Page navigation, tab switching, sidebar | 02-navigation, 09-sidebar |
| Topic search flow + loading state | 03-topic-search, 16-loading-states |
| PDF upload (single + multi) + loading state | 04-pdf-upload, 16-loading-states |
| URL analysis + loading state | 05-url-analysis, 16-loading-states |
| Text paste analysis + loading state | 06-text-analysis, 16-loading-states |
| Results page — view tabs, sections | 07-results-page |
| Results content — section items, stats, keywords | 14-results-content |
| Papers tab — card detail, expand, links | 15-papers-and-compare |
| Compare tab — table headers, row data, badges | 15-papers-and-compare |
| Workspace CRUD (API-level) | 08-workspace-crud |
| Sidebar workspace list, favorite, delete | 09-sidebar |
| Literature Review — 3-phase flow | 10-literature-review |
| Theme toggle + localStorage persistence | 11-theme |
| Error states, toasts, empty states | 12-error-states |
| Whitespace-only inputs, slider boundaries, PDF dedup | 17-input-edge-cases |
| Sidebar click → results, active state, delete-active | 18-workspace-ui-flow |
| Multi-PDF view tabs, paper titles, combined rendering | 19-multi-pdf-results |
| LR Phase 1 empty state, Phase 2 add/remove/counter, Phase 3 table+edit | 20-literature-review-builder |
| Network failures, backend 4xx messages, chat API | 21-network-errors |

---

## Backend Unit Tests

| Metric | Value |
|--------|-------|
| Total tests | 101 |
| Passed | **101** |
| Failed | 0 |
| Duration | ~1.1 s |
| Runner | Python unittest |

| Test Class | Tests | Coverage |
|---|---|---|
| TestComputeStats | 5 | `compute_stats()` in analyzer.py |
| TestCleanText | 4 | `clean_text()` in analyzer.py |
| TestFallbackKeywords | 4 | `_fallback_keywords()` in analyzer.py |
| TestStorageCreateWorkspace | 7 | `create_workspace()` in storage.py |
| TestSaveLoadAnalyses | 6 | `save_analyses()` / `load_workspace()` |
| TestSaveLoadCombined | 5 | `save_combined()` / `combined` key |
| TestStoragePapers | 3 | `save_papers()` + metadata update |
| TestToggleFavorite | 6 | `toggle_favorite()` persistence |
| TestStorageListWorkspaces | 4 | `list_workspaces()` sort + filter |
| TestStorageDeleteWorkspace | 4 | `delete_workspace()` disk removal |
| TestMergeStrLists | 9 | `_merge_str_lists()` in app.py |
| TestMergeAnalyses | 9 | `_merge_analyses()` fallback |
| TestFlaskRoutes | 35 | Flask routes via `test_client()` |

```bash
cd backend
venv\Scripts\python.exe -m unittest tests/test_backend.py -v
```

---

## Run Command

```bash
cd tests
npx playwright test          # runs all 167 mocked tests
npx playwright test e2e/13-integration.spec.js  # integration (requires GEMINI_API_KEY)
```
