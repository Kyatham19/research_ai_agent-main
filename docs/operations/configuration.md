# Configuration Reference — Research AI Agent

## Table of Contents

1. [Configuration Overview](#configuration-overview)
2. [Environment Variables](#environment-variables)
3. [LLM Settings](#llm-settings)
4. [Retrieval Settings](#retrieval-settings)
5. [Storage Settings](#storage-settings)
6. [Server Settings](#server-settings)
7. [Full Configuration Table](#full-configuration-table)
8. [Example .env File](#example-env-file)
9. [Changing Settings Safely](#changing-settings-safely)
10. [Do Not Change Without Testing](#do-not-change-without-testing)

---

## Configuration Overview

Configuration for this application comes from two sources:

1. **`backend/.env`** — runtime secrets and environment variables loaded by `python-dotenv` at startup via `load_dotenv()` in `backend/app.py`. This file is never committed to version control.

2. **Constants in source files** — tunable values embedded directly in Python source (`backend/extractors.py`, `backend/llm.py`, `backend/app.py`, `backend/storage.py`). These require a code edit and a server restart to change.

There is no database configuration, no external config file beyond `.env`, and no environment-specific config layering (dev/staging/prod). All settings described below are the only configuration surface.

---

## Environment Variables

These are the only values that must be set in `backend/.env`. The file is loaded once at process startup. Changing it requires a server restart.

### `GEMINI_API_KEY`

| Property | Value |
|----------|-------|
| **File** | `backend/.env` |
| **Default** | None — required |
| **Loaded by** | `backend/app.py` → `load_dotenv()` |
| **Used by** | `backend/llm.py` → `_configure()` → `os.environ.get("GEMINI_API_KEY", "")` |
| **How to obtain** | [aistudio.google.com](https://aistudio.google.com) |

The only required environment variable. If absent, any request that calls the LLM will fail with:

```
EnvironmentError: GEMINI_API_KEY not set.
```

The health endpoint (`GET /health`) reports whether the key is present:

```json
{"status": "ok", "llm": "gemini-2.5-flash", "api_key_configured": true}
```

---

## LLM Settings

All LLM settings live in `backend/llm.py` in the `_get_model()` function.

### Model name

```python
# backend/llm.py — _get_model()
model_name = "gemini-2.5-flash"
```

| Property | Value |
|----------|-------|
| **File** | `backend/llm.py`, function `_get_model()` |
| **Default** | `"gemini-2.5-flash"` |
| **Valid values** | Any model ID from the Gemini API (e.g., `"gemini-2.0-flash"`, `"gemini-1.5-pro"`) |
| **How to change** | Edit the string literal in `_get_model()`, restart Flask |

### Generation config

```python
generation_config = {
    "temperature":      0.2,    # 0.0–1.0; lower = more deterministic
    "top_p":            0.9,    # nucleus sampling probability
    "max_output_tokens": 4096   # maximum tokens in LLM response
}
```

| Parameter | Default | Effect |
|-----------|---------|--------|
| `temperature` | `0.2` | Controls output randomness. Lower values produce more consistent, deterministic JSON. Raising above `0.5` risks malformed JSON responses. |
| `top_p` | `0.9` | Nucleus sampling. Safe to leave unchanged. |
| `max_output_tokens` | `4096` | Maximum tokens in a single LLM call. The multi-paper synthesis prompt can produce large JSON; reducing this may truncate output. |

---

## Retrieval Settings

These constants live in `backend/extractors.py` and control how papers are fetched, filtered, and scored.

### `RELEVANCE_THRESHOLD`

```python
# backend/extractors.py (line 41)
RELEVANCE_THRESHOLD = 20
```

| Property | Value |
|----------|-------|
| **File** | `backend/extractors.py` |
| **Default** | `20` |
| **Range** | `0` to `100` |
| **Effect** | Papers with a composite relevance score below this value are dropped from results. A score of 0 keeps everything; 50 keeps only high-confidence matches. |

The composite score formula is:

```
composite = 0.50 * semantic_score
          + 0.25 * citation_score
          + 0.15 * recency_score
          + 0.10 * source_score
```

### `CURRENT_YEAR`

```python
# backend/extractors.py (line 44)
CURRENT_YEAR = datetime.now().year
```

| Property | Value |
|----------|-------|
| **File** | `backend/extractors.py` |
| **Default** | Current year at process startup |
| **Effect** | Used as the baseline for recency scoring. Papers 0–3 years old score 100; older papers score progressively lower. This value is evaluated once at import time, not on each request. |

### `SOURCE_SCORES`

```python
# backend/extractors.py — _score_and_rank()
SOURCE_SCORES = {
    "PubMed":           90,
    "Semantic Scholar": 75,
    "OpenAlex":         70,
    "arXiv":            60,
}
```

| Property | Value |
|----------|-------|
| **File** | `backend/extractors.py`, inside `_score_and_rank()` |
| **Default** | As shown above |
| **Range** | `0` to `100` per source |
| **Effect** | Authority weight applied to the source component of the composite score (10% weight). PubMed ranks highest because it is peer-reviewed. arXiv ranks lowest because it is a preprint server. |

### `fetch_per_source`

```python
# backend/extractors.py — search_papers()
fetch_per_source = max(max_results * 3, 20)
```

| Property | Value |
|----------|-------|
| **File** | `backend/extractors.py`, inside `search_papers()` |
| **Default** | `max(max_results * 3, 20)` — always at least 20 |
| **Effect** | Number of raw papers fetched per source before deduplication and ranking. A higher multiplier improves result quality at the cost of more API calls and longer latency. |

### `max_papers` per request

```python
# backend/app.py — /analyze/topic route
max_papers = data.get('max_papers', 10)
```

| Property | Value |
|----------|-------|
| **File** | `backend/app.py`, inside the `/analyze/topic` route handler |
| **Default** | `10` when the client does not specify |
| **Effect** | Maximum number of papers returned to the client. The client can override this by passing `max_papers` in the POST body. |

---

## Storage Settings

### `BASE_DIR`

```python
# backend/storage.py (line 23)
BASE_DIR = os.path.join(os.path.dirname(__file__), "data", "workspaces")
```

| Property | Value |
|----------|-------|
| **File** | `backend/storage.py` |
| **Default** | `backend/data/workspaces/` (relative to `storage.py`) |
| **Effect** | Root directory for all workspace data. Each workspace is a subdirectory named `workspace_<8-char-id>/`. |

**Workspace folder layout:**

```
backend/data/workspaces/
  workspace_<id>/
    metadata.json   — query, timestamps, favorite flag, paper_count, mode
    papers.json     — retrieved papers list
    analyses.json   — per-paper LLM analysis results
    ideas.json      — generated research ideas
    chat.json       — chat message history
    uploads/        — uploaded PDF files (binary)
```

---

## Server Settings

### Host and port

```python
# backend/app.py (last line)
app.run(debug=True, port=5000)
```

| Property | Value |
|----------|-------|
| **File** | `backend/app.py` |
| **Default host** | `127.0.0.1` (localhost only) |
| **Default port** | `5000` |
| **How to change** | Edit the `app.run()` call; restart Flask |

To bind to all interfaces (required when deploying behind nginx on a remote server):

```python
app.run(debug=False, host='0.0.0.0', port=5000)
```

### Debug mode

```python
app.run(debug=True, port=5000)
```

| Property | Value |
|----------|-------|
| **Default** | `True` in `app.py` |
| **Production** | Change to `debug=False` or use gunicorn/waitress (which ignore the `debug` flag) |
| **Effect** | Debug mode enables the Werkzeug debugger and auto-reloader. Do not run with `debug=True` in production — it exposes an interactive debugger to anyone who can reach the server. |

### Static frontend path

```python
# backend/app.py (line 20)
app = Flask(__name__, static_folder='../frontend/dist', static_url_path='')
```

| Property | Value |
|----------|-------|
| **File** | `backend/app.py` |
| **Default** | `../frontend/dist` (relative to `app.py`) |
| **Effect** | Tells Flask where to find the compiled React build. If you change the Vite output directory in `frontend/vite.config.js`, update this path to match. |

### CORS

```python
# backend/app.py (line 21)
CORS(app)
```

CORS is enabled globally for all origins. This is intentional for local development and single-origin deployments. In a production environment where you want to restrict origins:

```python
CORS(app, origins=["https://your-domain.com"])
```

---

## Full Configuration Table

| Name | Location | Default | Description | How to change |
|------|----------|---------|-------------|---------------|
| `GEMINI_API_KEY` | `backend/.env` | None (required) | Gemini API authentication key | Edit `.env`, restart Flask |
| `model_name` | `backend/llm.py` → `_get_model()` | `"gemini-2.5-flash"` | Gemini model used for all LLM calls | Edit string in `_get_model()`, restart |
| `temperature` | `backend/llm.py` → `_get_model()` | `0.2` | LLM output randomness (0.0–1.0) | Edit `generation_config` dict, restart |
| `top_p` | `backend/llm.py` → `_get_model()` | `0.9` | Nucleus sampling cutoff | Edit `generation_config` dict, restart |
| `max_output_tokens` | `backend/llm.py` → `_get_model()` | `4096` | Max tokens per LLM response | Edit `generation_config` dict, restart |
| `RELEVANCE_THRESHOLD` | `backend/extractors.py` | `20` | Minimum composite score to include a paper | Edit constant, restart |
| `CURRENT_YEAR` | `backend/extractors.py` | Current year at startup | Baseline for recency scoring | Evaluated at import; restart updates it |
| `SOURCE_SCORES["PubMed"]` | `backend/extractors.py` | `90` | Authority weight for PubMed papers | Edit `SOURCE_SCORES` dict, restart |
| `SOURCE_SCORES["Semantic Scholar"]` | `backend/extractors.py` | `75` | Authority weight for Semantic Scholar | Edit `SOURCE_SCORES` dict, restart |
| `SOURCE_SCORES["OpenAlex"]` | `backend/extractors.py` | `70` | Authority weight for OpenAlex | Edit `SOURCE_SCORES` dict, restart |
| `SOURCE_SCORES["arXiv"]` | `backend/extractors.py` | `60` | Authority weight for arXiv | Edit `SOURCE_SCORES` dict, restart |
| `fetch_per_source` | `backend/extractors.py` → `search_papers()` | `max(max_papers*3, 20)` | Raw papers fetched per source before ranking | Edit expression, restart |
| `max_papers` (default) | `backend/app.py` → `/analyze/topic` | `10` | Default paper count if client omits the field | Edit `data.get('max_papers', 10)`, restart |
| `BASE_DIR` | `backend/storage.py` | `backend/data/workspaces/` | Root directory for workspace storage | Edit path, restart; migrate existing data |
| `port` | `backend/app.py` → `app.run()` | `5000` | TCP port Flask listens on | Edit `app.run(port=...)`, restart |
| `debug` | `backend/app.py` → `app.run()` | `True` | Enables Werkzeug debugger and reloader | Set to `False` in production |
| `static_folder` | `backend/app.py` → `Flask(...)` | `../frontend/dist` | Path to compiled React build | Edit Flask constructor, rebuild frontend, restart |

---

## Example .env File

Create this file at `backend/.env`. Do not add quotes around values. Do not commit this file.

```dotenv
# backend/.env
# Required: Gemini API key from https://aistudio.google.com
GEMINI_API_KEY=AIzaSyYOURKEYHERE
```

That is the entire `.env` file — only one key is currently required. Additional variables can be added here if you extend the app (e.g., `OPENALEX_EMAIL`, `NCBI_API_KEY`).

---

## Changing Settings Safely

### Changing `GEMINI_API_KEY`

1. Edit `backend/.env`: replace the old value with the new key.
2. Restart Flask.
3. Verify: `curl http://localhost:5000/health` — check `"api_key_configured": true`.

### Changing the Gemini model

1. Edit `backend/llm.py`, function `_get_model()`: change the `model_name` string.
2. Restart Flask.
3. Test: submit a topic analysis request and verify the response JSON parses correctly. Model API changes between versions — check the Gemini changelog when upgrading.

### Lowering `RELEVANCE_THRESHOLD`

1. Edit `backend/extractors.py`, line with `RELEVANCE_THRESHOLD = 20`.
2. Set to a lower value (e.g., `10`) to include more papers with weaker relevance.
3. Restart Flask.
4. Test with a niche topic that previously returned "No papers found".

### Raising `max_output_tokens`

Useful if multi-paper synthesis is getting truncated. The Gemini 1.5 Flash model supports up to 8192 output tokens.

1. Edit `backend/llm.py`, `generation_config["max_output_tokens"]`.
2. Keep in mind larger values may incur higher API costs.
3. Restart Flask.

### Moving workspace storage

1. Stop Flask.
2. Copy `backend/data/workspaces/` to the new location.
3. Edit `BASE_DIR` in `backend/storage.py` to the new absolute path.
4. Restart Flask.
5. Verify existing workspaces appear in the sidebar.

---

## Do Not Change Without Testing

The following settings have non-obvious ripple effects. Only change them if you understand the consequences and have tested the change end-to-end.

### `temperature` above `0.5`

The app parses all LLM responses as JSON. The prompts are structured to elicit strict JSON output, and `temperature=0.2` keeps the model on task. Raising temperature above `0.5` increases the probability of the model producing prose, markdown, or malformed JSON, which causes `ValueError: Could not parse JSON` errors in `call_llm()`. The fallback mechanisms in `extractors.py` will absorb some failures, but the analysis quality will degrade.

### `RELEVANCE_THRESHOLD` above `40`

At high thresholds, even genuinely relevant papers may fail to pass the filter if the LLM scoring underestimates their relevance. Topics with limited academic literature are most at risk. If you raise the threshold and users start seeing "No papers found for this topic" for reasonable queries, lower it.

### `static_folder` path in `Flask(...)`

This path is evaluated relative to the location of `app.py`. If you move `app.py` or change the Vite output directory, both must be updated consistently or Flask will fail to serve the frontend and all routes will return 404 for the UI.

### `BASE_DIR` in `storage.py`

Changing this path without migrating existing workspace data makes all previously created workspaces invisible to the app (they still exist on disk but Flask cannot find them). Always stop the server, copy the data, then update the path.

### `max_output_tokens` below `2048`

The multi-paper synthesis prompt (`multi_paper_analysis_prompt` in `llm.py`) produces a large, deeply nested JSON object. Values below 2048 tokens will cause the response to be truncated mid-JSON, triggering `ValueError: Could not parse JSON`. The fallback `_merge_analyses()` function in `app.py` handles this gracefully but produces lower-quality output.
