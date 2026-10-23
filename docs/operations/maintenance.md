# Maintenance Guide — Research AI Agent

## Table of Contents

1. [Regular Maintenance Tasks](#regular-maintenance-tasks)
2. [Workspace Cleanup](#workspace-cleanup)
3. [Backing Up Workspace Data](#backing-up-workspace-data)
4. [Upgrading Python Dependencies](#upgrading-python-dependencies)
5. [Upgrading the Gemini Model](#upgrading-the-gemini-model)
6. [Rebuilding the Frontend](#rebuilding-the-frontend)
7. [Clearing the pip Cache](#clearing-the-pip-cache)
8. [Developer Extension Guide: Adding a New Paper Source](#developer-extension-guide-adding-a-new-paper-source)

---

## Regular Maintenance Tasks

| Task | Recommended Frequency | How |
|------|----------------------|-----|
| Delete unused workspaces | Weekly or on-demand | Via UI trash icon, API DELETE, or manual `rmdir` |
| Back up workspaces directory | Before any major change / weekly for active use | `xcopy` or `rsync` (see [Backing Up](#backing-up-workspace-data)) |
| Check disk space for workspaces | Monthly | Each workspace ~1 MB typical; PDFs can be larger |
| Upgrade `google-generativeai` | When Gemini API changes or new models release | `pip install --upgrade google-generativeai` + test |
| Rebuild frontend | After any change to `frontend/src/**` | `cd frontend && npm run build` |
| Rotate Gemini API key | Per your organization's security policy | New key in `backend/.env`, restart |
| Clear pip cache | If pip install fails with deserialization errors | `pip cache purge` |
| Review Flask logs | After periods of heavy use | Check terminal or log file for recurring errors |
| Test external API connectivity | If users report "no papers found" | `curl` each source API (see Troubleshooting) |

---

## Workspace Cleanup

Each workspace is stored as a directory under `backend/data/workspaces/`:

```
backend/data/workspaces/
  workspace_3b94059e/
    metadata.json
    papers.json
    analyses.json
    ideas.json
    chat.json
    uploads/          ← uploaded PDFs stored here
      paper1.pdf
      paper2.pdf
```

A typical workspace with no uploaded files is about 50–200 KB. Workspaces with uploaded PDFs can be several MB each. On active installations, the workspaces directory can grow large over time.

### Option 1 — Via the UI (individual workspaces)

Click the trash icon in the sidebar next to any workspace. This calls `DELETE /api/workspaces/<wid>` which runs `shutil.rmtree()` on the workspace directory.

### Option 2 — Via the REST API

```bash
# Delete a specific workspace by ID
curl -X DELETE http://localhost:5000/api/workspaces/3b94059e

# List all workspaces to find IDs
curl http://localhost:5000/api/workspaces
```

### Option 3 — Manual deletion (single workspace)

```bash
# Windows
rmdir /s /q "backend\data\workspaces\workspace_3b94059e"

# Linux/macOS
rm -rf backend/data/workspaces/workspace_3b94059e
```

### Option 4 — Bulk clear all workspaces

This permanently deletes all workspace history. There is no undo.

```bash
# Windows
rmdir /s /q "backend\data\workspaces"
mkdir "backend\data\workspaces"

# Linux/macOS
rm -rf backend/data/workspaces/*
```

After bulk clearing, new workspaces will be created normally when users next use the app.

### Finding large workspaces

On Linux/macOS, identify which workspaces are consuming the most disk space:

```bash
du -sh backend/data/workspaces/workspace_* | sort -rh | head -20
```

On Windows:

```bash
# In PowerShell (approximate, in MB)
Get-ChildItem "backend\data\workspaces" -Directory | ForEach-Object {
    $size = (Get-ChildItem $_.FullName -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
    [PSCustomObject]@{Name=$_.Name; SizeMB=[math]::Round($size,2)}
} | Sort-Object SizeMB -Descending | Select-Object -First 20
```

---

## Backing Up Workspace Data

The `backend/data/workspaces/` directory contains all persistent application state: research history, paper lists, analysis results, chat logs, and uploaded PDFs. There is no database — it is all plain JSON files and binary PDFs.

### Before any maintenance operation

Stop the Flask server before backing up to avoid reading partially written JSON files:

```bash
# Stop Flask (Ctrl+C in the terminal, or kill the process)
# Then back up:

# Windows
xcopy /E /I /H "backend\data\workspaces" "backup\workspaces-%date%"

# Linux/macOS
cp -r backend/data/workspaces backup/workspaces-$(date +%Y%m%d)
```

### Scheduled backup (Linux/macOS via cron)

Add to crontab (`crontab -e`) to back up nightly at 2 AM:

```cron
0 2 * * * cp -r /path/to/research-analyzer/backend/data/workspaces /path/to/backup/workspaces-$(date +\%Y\%m\%d)
```

### Backup to a zip archive

```bash
# Linux/macOS
cd backend/data
tar -czf ../../backup/workspaces-$(date +%Y%m%d).tar.gz workspaces/

# Windows (PowerShell)
Compress-Archive -Path "backend\data\workspaces" -DestinationPath "backup\workspaces-$(Get-Date -Format yyyyMMdd).zip"
```

### Restoring from backup

1. Stop the Flask server.
2. Replace `backend/data/workspaces/` with the backup copy:
   ```bash
   # Linux/macOS
   rm -rf backend/data/workspaces
   cp -r backup/workspaces-20260614 backend/data/workspaces

   # Windows
   rmdir /s /q backend\data\workspaces
   xcopy /E /I backup\workspaces-20260614 backend\data\workspaces
   ```
3. Restart the Flask server.
4. Verify workspaces appear in the sidebar.

---

## Upgrading Python Dependencies

### Pinned versions (current)

From `backend/requirements.txt`:

```
flask==3.0.0
flask-cors==4.0.0
pymupdf==1.23.8
pdfminer.six==20221105
requests==2.31.0
google-generativeai==0.7.2
python-dotenv==1.0.0
```

### Upgrading `google-generativeai` (most likely to need updates)

The Gemini Python SDK changes frequently as new models and API features release.

```bash
# 1. Activate the venv
cd backend
source venv/bin/activate    # Linux/macOS
# venv\Scripts\activate     # Windows

# 2. Check current version
pip show google-generativeai

# 3. Upgrade
pip install --upgrade google-generativeai

# 4. Check what version was installed
pip show google-generativeai

# 5. Run a full end-to-end test
python app.py &
curl -X POST http://localhost:5000/analyze/topic \
  -H "Content-Type: application/json" \
  -d '{"topic": "transformer neural networks", "max_papers": 3}'
# Verify: response contains "individual_papers" and "combined_analysis"

# 6. If the test passes, save new pins
pip freeze > requirements.txt
```

**What to watch for after upgrading `google-generativeai`:**
- API surface changes: `genai.GenerativeModel`, `model.generate_content()`, and `response.text` occasionally change between minor versions. Check the [google-generativeai changelog](https://github.com/google/generative-ai-python/releases).
- The `generation_config` dict format may change.
- New model IDs may be required if old model names are deprecated.

### Upgrading other packages

```bash
# Upgrade a specific package
pip install --upgrade flask

# Test: ensure the app starts and a basic route works
python -c "from app import app; print('ok')"

# Save new pins
pip freeze > requirements.txt
```

### Rolling back a broken upgrade

If an upgrade breaks the app, roll back to the pinned versions:

```bash
pip install -r requirements.txt
# requirements.txt has the last known-good pins
```

### Testing after any dependency change

The minimum test sequence after any package change:

1. Flask imports cleanly:
   ```bash
   python -c "from app import app; print('imports ok')"
   ```

2. Health endpoint responds:
   ```bash
   python app.py &
   curl http://localhost:5000/health
   ```

3. Topic search works end-to-end:
   ```bash
   curl -X POST http://localhost:5000/analyze/topic \
     -H "Content-Type: application/json" \
     -d '{"topic": "deep learning image classification", "max_papers": 2}'
   ```
   Verify the response contains `individual_papers` (list) and `combined_analysis` (object).

4. PDF extraction works (if pymupdf was changed):
   ```bash
   curl -X POST http://localhost:5000/analyze/pdf \
     -F "file=@/path/to/any/paper.pdf"
   ```

---

## Upgrading the Gemini Model

The model is configured in one place: `backend/llm.py`, function `_get_model()`.

```python
# backend/llm.py — current configuration
def _get_model(large_output: bool = False):
    _configure()
    return genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        generation_config={"temperature": 0.2, "top_p": 0.9, "max_output_tokens": 8192 if large_output else 4096}
    )
```

### Procedure

1. **Check available models** at [ai.google.dev/models](https://ai.google.dev/models) or via the API:
   ```python
   import google.generativeai as genai
   genai.configure(api_key="YOUR_KEY")
   for m in genai.list_models():
       print(m.name, m.supported_generation_methods)
   ```

2. **Edit `backend/llm.py`**, change the `model_name` string:
   ```python
   model_name = "gemini-2.0-flash"      # example: newer Flash model
   # or
   model_name = "gemini-1.5-pro"        # higher capability, slower, higher cost
   ```

3. **Consider `max_output_tokens`:** More capable models support larger output windows. Check the model's limits and increase if you are seeing truncated JSON:
   ```python
   generation_config={"temperature": 0.2, "top_p": 0.9, "max_output_tokens": 8192}
   ```

4. **Restart Flask.**

5. **Test all JSON-returning prompts**, because the model must produce strictly valid JSON for several prompts. A new model may handle these differently:

   ```bash
   # Test topic search (uses topic_expansion_prompt, relevance_scoring_prompt,
   #                         multi_paper_analysis_prompt)
   curl -X POST http://localhost:5000/analyze/topic \
     -H "Content-Type: application/json" \
     -d '{"topic": "attention mechanism in transformers", "max_papers": 3}'

   # Test PDF analysis (uses analyze_paper_prompt)
   curl -X POST http://localhost:5000/analyze/pdf \
     -F "file=@/path/to/paper.pdf"

   # Test literature review (uses literature_review_prompt)
   # (requires at least 2 papers already in a workspace)
   ```

6. **Check for JSON parse errors** in the Flask log. If you see `ValueError: Could not parse JSON`, the model is not following the JSON-only output format reliably. Try adding an explicit instruction to the system/user prompt, or switch back to the previous model.

**Trade-offs between models:**

| Model | Speed | Cost | JSON reliability | Max output |
|-------|-------|------|-----------------|-----------|
| `gemini-2.5-flash` | Fast | Low | High (current) | 8192 tokens |
| `gemini-2.0-flash` | Fast | Low-medium | High | 8192 tokens |
| `gemini-1.5-flash` | Fast | Low | High (tuned prompts) | 8192 tokens |
| `gemini-1.5-pro` | Slower | Higher | Very high | 8192 tokens |

---

## Rebuilding the Frontend

The React frontend must be rebuilt whenever any file under `frontend/src/` is changed. Flask serves the compiled output from `frontend/dist/`; it does not read source files at runtime.

### When to rebuild

- After editing any file in `frontend/src/` (components, pages, App.jsx, App.css, main.jsx)
- After changing `frontend/package.json` dependencies
- After any `npm install` that adds or changes packages
- When deploying to a new machine (always rebuild to ensure a clean output)

### Rebuild procedure

```bash
# 1. Navigate to the frontend directory
cd frontend

# 2. Ensure dependencies are installed (only needed once, or after package.json changes)
npm install

# 3. Build
npm run build
# Vite outputs to frontend/dist/

# 4. Verify the output
ls dist/          # Linux/macOS
dir dist\         # Windows
# Expected: index.html  assets/

# 5. Restart the Flask server
# (Flask must be restarted because it may have cached 404s for new asset filenames)
```

### What Vite produces

```
frontend/dist/
  index.html                  — SPA entry point
  assets/
    index-<hash>.js           — bundled React application
    index-<hash>.css          — bundled styles
    (other hashed asset files)
```

Vite appends content-hash suffixes to asset filenames for cache-busting. This means the filenames change on every build — this is expected and correct.

### Development mode (no rebuild needed)

During active frontend development, run the Vite dev server instead of rebuilding on every change:

```bash
cd frontend
npm run dev     # starts at http://localhost:5173 with hot module replacement
```

The Vite dev server serves the frontend directly; it does not write to `dist/`. Flask's API at port 5000 handles API calls. When development is complete, build once and restart Flask.

---

## Clearing the pip Cache

pip maintains a local package cache to speed up reinstalls. The cache can become corrupted, causing errors like:

```
WARNING: Cache entry deserialization failed, entry ignored
pip: error: Cache entry ... is not valid
```

Clear the cache:

```bash
pip cache purge
```

This does not affect installed packages — it only clears the download cache. The next `pip install` will re-download packages from PyPI.

---

## Developer Extension Guide: Adding a New Paper Source

The retrieval pipeline in `backend/extractors.py` is designed to make adding sources straightforward. Sources run concurrently via `ThreadPoolExecutor`.

### Architecture recap

```
search_papers(topic)
  │
  ├── expand_topic(topic)           → LLM generates search queries + metadata
  │
  ├── ThreadPoolExecutor
  │     ├── run_arxiv()             → _search_arxiv_api()
  │     ├── run_semantic_scholar()  → _search_semantic_scholar()
  │     ├── run_openalex()          → _search_openalex()
  │     └── run_pubmed()            → _search_pubmed()   (medical only)
  │
  ├── _deduplicate(all_papers)      → merge by arxiv_id, DOI, title
  └── _score_and_rank(papers)       → composite score → filter → top N
```

### Step 1 — Write the `_search_<source>()` function

Add a new function to `backend/extractors.py` following the existing pattern. The function must:

- Accept `query: str` and `max_results: int` parameters
- Return a `list[dict]` — each dict is one paper
- Return `[]` (not raise) on any error — wrap everything in `try/except`

**Required keys in each returned dict:**

| Key | Type | Description |
|-----|------|-------------|
| `title` | `str` | Paper title, whitespace-normalized |
| `abstract` | `str` | Paper abstract, at least 50 characters |
| `authors` | `list[str]` | Author names, up to 6 |
| `year` | `str` | 4-digit publication year, e.g. `"2023"` |
| `published` | `str` | ISO date or year, e.g. `"2023-05-12"` or `"2023"` |
| `url` | `str` | Direct link to the paper (open access preferred, DOI otherwise) |
| `citations` | `int` | Citation count, or `0` if unavailable |
| `source` | `str` | Source name string, e.g. `"CrossRef"` |
| `venue` | `str` | Journal or conference name, or `""` |
| `_arxiv_id` | `str` | arXiv ID (e.g. `"2301.12345"`), or `""` — used for deduplication |
| `_doi` | `str` | DOI without `https://doi.org/` prefix, or `""` — used for deduplication |

**Example skeleton:**

```python
def _search_crossref(query: str, max_results: int) -> list:
    """
    Search CrossRef for academic papers.
    API docs: https://api.crossref.org/swagger-ui/index.html
    No API key required; polite pool available via mailto parameter.
    """
    try:
        encoded = urllib.parse.quote(query)
        url = (
            f"https://api.crossref.org/works"
            f"?query={encoded}"
            f"&rows={max_results * 2}"
            f"&select=title,abstract,author,published,DOI,is-referenced-by-count,container-title"
            f"&mailto=your-email@example.com"
        )
        req = urllib.request.Request(url, headers=JSON_HEADERS)
        with urllib.request.urlopen(req, timeout=20, context=SSL_CTX) as resp:
            data = json.loads(resp.read())

        papers = []
        for item in data.get("message", {}).get("items", []):
            title    = " ".join(item.get("title", [])).strip()
            abstract = item.get("abstract", "").strip()
            # CrossRef wraps abstracts in <jats:p> tags — strip them
            abstract = re.sub(r"<[^>]+>", " ", abstract).strip()

            if not title or len(abstract) < 50:
                continue

            authors = [
                f"{a.get('given', '')} {a.get('family', '')}".strip()
                for a in item.get("author", [])[:6]
            ]

            doi = item.get("DOI", "")
            published = item.get("published", {})
            date_parts = published.get("date-parts", [[]])[0]
            year = str(date_parts[0]) if date_parts else ""

            papers.append({
                "title":     title,
                "abstract":  abstract,
                "authors":   authors,
                "year":      year,
                "published": year,
                "url":       f"https://doi.org/{doi}" if doi else "",
                "citations": item.get("is-referenced-by-count", 0) or 0,
                "source":    "CrossRef",
                "venue":     " ".join(item.get("container-title", [])),
                "_arxiv_id": "",
                "_doi":      doi,
            })

            if len(papers) >= max_results:
                break

        return papers

    except Exception as e:
        print(f"    [CrossRef] error for query '{query[:50]}': {e}")
        return []
```

### Step 2 — Add a `run_<source>()` closure inside `search_papers()`

In `backend/extractors.py`, find the `search_papers()` function. Locate the `sources` dict definition (around line 154) and add your new source:

```python
# Existing code (do not change):
def run_pubmed():
    if not is_medical:
        return []
    results = []
    for q in queries[:3]:
        results += _search_pubmed(q, fetch_per_source // 3)
    return results

# Add your new closure here:
def run_crossref():
    results = []
    for q in queries[:3]:
        results += _search_crossref(q, fetch_per_source // 3)
    return results

# Existing sources dict — add your source here:
sources = {
    "arXiv":            run_arxiv,
    "Semantic Scholar": run_semantic_scholar,
    "OpenAlex":         run_openalex,
    "PubMed":           run_pubmed,
    "CrossRef":         run_crossref,     # ← add this line
}
```

The `ThreadPoolExecutor` iterates over the `sources` dict automatically, so this is all that is needed to wire it in.

### Step 3 — Add the source to `SOURCE_SCORES`

In `backend/extractors.py`, inside the `_score_and_rank()` function, add your source to the `SOURCE_SCORES` dict:

```python
SOURCE_SCORES = {
    "PubMed":           90,
    "Semantic Scholar": 75,
    "OpenAlex":         70,
    "arXiv":            60,
    "CrossRef":         72,    # ← add this line; adjust weight based on authority
}
```

The source score contributes 10% of the composite relevance score. Choose the weight relative to existing sources:
- 80–90: peer-reviewed, curated, strong metadata
- 65–79: broad academic coverage, mixed quality control
- 50–65: preprints, grey literature, or weak metadata

### Step 4 — Test the new source

1. Restart Flask.

2. Run a topic search and watch the terminal output for your new source:
   ```
   [CrossRef] returned 18 raw papers
   ```
   If you see `[CrossRef] failed: ...`, check the exception message in the log.

3. Verify results include papers from the new source:
   ```bash
   curl -X POST http://localhost:5000/analyze/topic \
     -H "Content-Type: application/json" \
     -d '{"topic": "transformer attention mechanism", "max_papers": 5}' \
     | python -m json.tool | grep '"source"'
   ```

4. Check deduplication is working: papers appearing in both CrossRef and Semantic Scholar should appear only once in the final list. The deduplication logic in `_deduplicate()` matches on DOI and title, so as long as `_doi` is populated correctly, duplicates will be merged.

### Conditional sources (like PubMed)

If your source is only relevant for certain topics (e.g., a legal database for law-related searches), check the `topic_info` dict from `expand_topic()`:

```python
def run_legal_db():
    # Only search legal databases if the domain is law or social science
    if topic_info.get("domain") not in ("social_science", "other"):
        return []
    results = []
    for q in queries[:3]:
        results += _search_legal_db(q, fetch_per_source // 3)
    return results
```

The `topic_info` dict keys available in `search_papers()` are:
- `domain` — one of: `medical`, `computer_science`, `physics`, `biology`, `chemistry`, `engineering`, `mathematics`, `social_science`, `economics`, `other`
- `is_medical` — boolean
- `canonical_topic` — cleaned topic string
- `search_queries` — list of 4–5 search queries
- `arxiv_categories` — list of arXiv category codes
- `relevance_concepts` — list of key concepts for relevance scoring
- `rejection_signals` — list of concepts that indicate off-topic papers
