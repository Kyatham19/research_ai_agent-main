# Workspace Lifecycle

## Overview

Workspaces are the persistence layer of the Research AI Agent. Each workspace maps a single
analysis session to a folder on disk containing five JSON files and an uploads subdirectory.
Workspaces are created automatically — one per analysis run — before the analysis request is
sent, so results are always saved even if the user navigates away. The Sidebar lists all
workspaces sorted by most-recently-opened. Selecting a workspace re-hydrates the React state
tree from the stored JSON so the full results view is restored exactly as it was when the
analysis completed.

---

## State Diagram

```
                     POST /api/workspaces
                    ┌─────────────────────┐
                    │                     │
                    ▼                     │
              ┌──────────┐                │ User starts new search
              │  CREATED  │────────────────┘
              └──────────┘
                    │
                    │  Analysis completes
                    │  save_papers() / save_analyses() / update_metadata()
                    ▼
              ┌──────────┐
              │  UPDATED  │◄──────────────────────────┐
              └──────────┘                             │
                    │                                  │
                    │  GET /api/workspaces/<wid>        │  POST /api/workspaces/<wid>/chat
                    │  update_last_opened()             │  save_chat_message()
                    ▼                                  │
              ┌──────────┐                             │
              │  LOADED   │─────────────────────────────┘
              └──────────┘
                    │
                    │  POST /api/favorite/<wid>
                    │  toggle_favorite()
                    ▼
              ┌───────────┐
              │ FAVORITED  │  (can toggle back to non-favorite)
              └───────────┘
                    │
                    │  DELETE /api/workspaces/<wid>
                    │  shutil.rmtree()
                    ▼
              ┌──────────┐
              │  DELETED  │  (folder removed, no recovery)
              └──────────┘
```

---

## Folder Layout

```
backend/
└── data/
    └── workspaces/
        └── workspace_3b94059e/          ← folder name: "workspace_" + 8-char UUID prefix
            ├── metadata.json            ← identity, timestamps, mode, favorite flag
            ├── papers.json              ← raw paper dicts from retrieval pipeline
            ├── analyses.json            ← per-paper analyze_text() results
            ├── ideas.json               ← reserved for research idea generation (future)
            ├── chat.json                ← append-only chat message history
            └── uploads/                 ← binary PDF files uploaded by the user
                ├── paper1.pdf
                └── paper2.pdf
```

### File Contents

**metadata.json**
```json
{
  "id": "3b94059e",
  "query": "retinal vessel segmentation",
  "created_at": "2024-03-15T10:22:31.445Z",
  "last_opened": "2024-03-15T14:07:19.882Z",
  "favorite": false,
  "paper_count": 5,
  "mode": "topic"
}
```

**papers.json** — array of raw paper dicts from the retrieval pipeline:
```json
[
  {
    "title": "...",
    "abstract": "...",
    "authors": ["Author A", "Author B"],
    "year": "2023",
    "published": "2023-09-12",
    "url": "https://arxiv.org/abs/2309.xxxxx",
    "citations": 142,
    "source": "Semantic Scholar",
    "venue": "NeurIPS",
    "relevance_score": 87.3,
    "_arxiv_id": "2309.xxxxx",
    "_doi": "10.xxxx/xxxxx"
  }
]
```

**analyses.json** — array of `analyze_text()` result dicts, one per paper:
```json
[
  {
    "title": "...",
    "source": "Semantic Scholar",
    "executive_summary": "...",
    "research_problem": "...",
    "methodology": { "overview": "...", "key_components": [], "novelty": "..." },
    "datasets": [{ "name": "DRIVE", "type": "public benchmark", ... }],
    "evaluation": { "metrics": ["Dice", "IoU"], "baselines": [...], "protocol": "..." },
    "results_and_findings": [...],
    "research_gaps": { "from_limitations": [...], ... },
    "future_scope": { "author_suggested": [...], "ai_generated": [...] },
    "keywords": [{ "term": "retinal vessel", "score": 9 }],
    "stats": { "word_count": 312, "sentence_count": 18, ... }
  }
]
```

**ideas.json** — initially `[]`, reserved for future research idea generation feature.

**chat.json** — append-only array of chat messages:
```json
[
  {
    "id": "a1b2c3d4",
    "role": "user",
    "content": "What are the main limitations of these papers?",
    "timestamp": "2024-03-15T14:08:00.123Z"
  },
  {
    "id": "e5f6a7b8",
    "role": "assistant",
    "content": "...",
    "timestamp": "2024-03-15T14:08:03.456Z"
  }
]
```

---

## Lifecycle Operations

### CREATE — New Workspace

**Trigger:** User clicks "Search" / "Analyze" in `InputPage.jsx`.

Workspace creation happens in the frontend **before** the analysis HTTP request is sent,
so the workspace ID is available to pass to the analysis endpoint.

```javascript
// InputPage.jsx
const wid = await createWorkspace(query);
// Then:
fetch('/analyze/topic', { body: JSON.stringify({ topic, max_papers, workspace_id: wid }) })
```

**HTTP call:**
```
POST /api/workspaces
Content-Type: application/json
Body: { "query": "<user input string>" }

Response 201:
{
  "id": "3b94059e",
  "query": "retinal vessel segmentation",
  "created_at": "2024-03-15T10:22:31.445Z",
  "last_opened": "2024-03-15T10:22:31.445Z",
  "favorite": false,
  "paper_count": 0,
  "mode": "topic"
}
```

**Storage function:** `create_workspace(query)` in `backend/storage.py`

1. Generates ID: `str(uuid.uuid4())[:8]` — first 8 characters of a UUID4
2. Records current UTC time as both `created_at` and `last_opened`
3. Creates directory tree: `os.makedirs(_uploads_dir(workspace_id), exist_ok=True)`
   This creates both the workspace folder and the `uploads/` subfolder in one call.
4. Writes 5 JSON files with initial content:
   - `metadata.json` — full metadata dict
   - `papers.json` — `[]`
   - `analyses.json` — `[]`
   - `ideas.json` — `[]`
   - `chat.json` — `[]`
5. Returns the metadata dict

**On failure:** If workspace creation fails (e.g., disk full), `InputPage.jsx` catches
the error and sets `wid = null`. The analysis request still proceeds — the backend accepts
`workspace_id: null` and simply skips saving. No error is shown to the user for workspace
creation failure.

**What changes on disk:**
```
data/workspaces/workspace_3b94059e/  ← NEW directory
    metadata.json                     ← NEW (paper_count=0, mode="topic")
    papers.json                       ← NEW (empty array)
    analyses.json                     ← NEW (empty array)
    ideas.json                        ← NEW (empty array)
    chat.json                         ← NEW (empty array)
    uploads/                          ← NEW directory
```

---

### UPDATE — Analysis Completion

**Trigger:** An analysis endpoint (`/analyze/topic`, `/analyze/pdf`, `/analyze/pdfs`,
`/analyze/url`, `/analyze/text`) completes successfully and a `workspace_id` was provided.

**HTTP call:** The analysis endpoint itself (`POST /analyze/topic`, etc.) — the workspace
update is a side effect at the end of the route handler, not a separate HTTP call.

**Storage functions called (topic search example):**

```python
save_papers(wid, papers)
# Overwrites papers.json with the retrieved paper list
# Also updates metadata.json: paper_count = len(papers)

save_analyses(wid, results)
# Overwrites analyses.json with the per-paper analysis list

update_metadata(wid, {"mode": "topic", "paper_count": len(papers)})
# Merges {"mode": "topic", "paper_count": 5} into metadata.json
```

For PDF uploads, `save_uploaded_file()` is also called before `save_analyses()`:
```python
file.seek(0)
save_uploaded_file(wid, file.filename, file.read())
# Writes binary to: uploads/<filename>
```

`update_metadata()` does a read-modify-write: reads the existing `metadata.json`,
merges the update dict with Python `dict.update()`, and writes the result back.
This preserves any fields already in metadata (e.g., `favorite`, `created_at`).

**What changes on disk:**
```
workspace_3b94059e/
    metadata.json    ← UPDATED: paper_count, mode, last_updated implicit via mode change
    papers.json      ← OVERWRITTEN: raw paper list
    analyses.json    ← OVERWRITTEN: per-paper analysis list
    uploads/         ← PDF binary written here (PDF mode only)
```

---

### LOAD — Open a Workspace

**Trigger:** User clicks a workspace entry in the Sidebar.

**HTTP call:**
```
GET /api/workspaces/<wid>

Response 200:
{
  "metadata": { "id": "3b94059e", "query": "...", "mode": "topic", ... },
  "papers":   [ /* raw paper dicts */ ],
  "analyses": [ /* per-paper analysis dicts */ ],
  "ideas":    [],
  "chat":     [ /* chat messages */ ]
}

Response 404:
{ "error": "Not found" }
```

**Storage functions:**
1. `update_last_opened(wid)` — called **first**, before loading data. Reads `metadata.json`,
   sets `last_opened` to current UTC ISO timestamp, writes back.
2. `load_workspace(wid)` — reads all 5 JSON files and returns them as a dict.

**What changes on disk:**
```
workspace_3b94059e/
    metadata.json    ← UPDATED: last_opened timestamp
```

---

### LIST — Sidebar Workspace List

**Trigger:** Sidebar component mounts or `refreshTrigger` prop changes (incremented after
each analysis completes).

**HTTP call:**
```
GET /api/workspaces

Response 200:
[
  { "id": "3b94059e", "query": "retinal vessel...", "last_opened": "...", "favorite": false, ... },
  { "id": "6320939e", "query": "transformer attention", "last_opened": "...", "favorite": true, ... },
  ...
]
```

**Storage function:** `list_workspaces()`

Reads `BASE_DIR` (`backend/data/workspaces/`), iterates over all subdirectories, reads
`metadata.json` from each, filters out entries without an `id` field (guards against
corrupted or non-workspace directories), and sorts by `last_opened` descending.

**What changes on disk:** Nothing — read-only operation.

---

### FAVORITE — Toggle Favorite Status

**Trigger:** User clicks the star icon on a workspace in the Sidebar.

**HTTP call:**
```
POST /api/favorite/<wid>

Response 200:
{ "favorite": true }   (or false if toggled off)
```

**Storage function:** `toggle_favorite(wid)`

Read-modify-write on `metadata.json`:
```python
metadata["favorite"] = not metadata.get("favorite", False)
```

Returns the new boolean value.

**What changes on disk:**
```
workspace_3b94059e/
    metadata.json    ← UPDATED: "favorite" flipped
```

---

### CHAT — Append Chat Message

**Trigger:** User sends a message in the workspace chat panel.

**HTTP call:**
```
POST /api/workspaces/<wid>/chat
Content-Type: application/json
Body: { "role": "user", "content": "What are the main limitations?" }

Response 201:
{
  "id": "a1b2c3d4",
  "role": "user",
  "content": "What are the main limitations?",
  "timestamp": "2024-03-15T14:08:00.123Z"
}

Response 400:
{ "error": "Empty message" }   (if content is blank after strip())
```

**Storage function:** `save_chat_message(workspace_id, role, content)`

Appends to `chat.json` (not overwrites):
```python
messages = _read_json(chat_path, [])
message = {
    "id":        str(uuid.uuid4())[:8],
    "role":      role,   # "user" or "assistant"
    "content":   content,
    "timestamp": _now()  # UTC ISO 8601 with "Z" suffix
}
messages.append(message)
_write_json(chat_path, messages)
return message
```

Chat history is unbounded — all messages are preserved. The frontend is responsible for
any pagination or truncation in the UI.

**What changes on disk:**
```
workspace_3b94059e/
    chat.json    ← APPENDED: one new message object
```

---

### DELETE — Remove Workspace

**Trigger:** User clicks "Delete" on a workspace in the Sidebar.

**HTTP call:**
```
DELETE /api/workspaces/<wid>

Response 200:
{ "deleted": true }

Response 404:
{ "error": "Not found" }
```

**Storage function:** `delete_workspace(wid)`

```python
shutil.rmtree(ws_dir)
```

This recursively removes the entire workspace folder and all its contents — all JSON files,
the uploads subdirectory, and all uploaded PDF binaries. **This operation is irreversible.**

**What changes on disk:**
```
data/workspaces/workspace_3b94059e/   ← REMOVED (entire directory tree)
```

---

## File Upload Storage

**Trigger:** PDF analysis with `workspace_id` present.

**Storage function:** `save_uploaded_file(workspace_id, filename, file_bytes)`

```python
uploads = _uploads_dir(workspace_id)
os.makedirs(uploads, exist_ok=True)
dest = os.path.join(uploads, filename)
with open(dest, "wb") as f:
    f.write(file_bytes)
return dest
```

Uploads are saved with their original filename. If the same filename is uploaded twice,
the second write silently overwrites the first. No renaming or collision handling is applied.

The `uploads/` directory is created with `exist_ok=True` on every call, so there is no
error if it was already created during `create_workspace()`.

**Important:** The file object must be seeked back to position 0 before reading for binary
save, because text extraction already consumed the stream:
```python
# In app.py /analyze/pdf route:
text = extract_from_pdf(file)  # consumes file stream
if wid:
    file.seek(0)               # reset for binary read
    save_uploaded_file(wid, file.filename, file.read())
```

---

## Re-hydration — How App.jsx Restores Workspace State

When a user selects a workspace from the Sidebar, `handleSelectWorkspace(id)` in `App.jsx`
calls `loadWorkspace(id)`, which fetches `GET /api/workspaces/<wid>`. The full workspace
data (metadata + papers + analyses + chat) is returned.

`App.jsx` then inspects `ws.metadata.mode` and reconstructs the `results` state object
that `ResultsPage` expects:

### Topic Mode Re-hydration

```javascript
if (ws.metadata.mode === "topic") {
    setMode("topic");
    setResults({
        _mode:            "topic",
        _input:           ws.metadata.query,      // original search term
        topic:            ws.metadata.query,
        paper_count:      ws.papers.length,
        individual_papers: ws.analyses,           // analyses array used as individual_papers
        combined_analysis: ws.analyses[0],        // first analysis used as combined placeholder
        workspace_id:     id,
    });
}
```

**Key re-hydration decision:** `ws.analyses` (the per-paper `analyze_text()` results) is
used as `individual_papers`. The `combined_analysis` is set to the first analysis entry as a
placeholder because the multi-paper synthesis result is not independently stored — it was
included in the original HTTP response but not written to a dedicated file. This means
re-opened topic workspaces show the individual paper analyses correctly, but the combined
analysis tab shows only the first paper's analysis rather than the full synthesis.

`ws.papers` (the raw retrieval data) is used for `paper_count` but not directly displayed
in ResultsPage — the display relies on `ws.analyses` which contains the enriched analysis
dicts with paper metadata merged in by `app.py`.

**Guard:** `if (!ws.analyses?.length) return;` — if the workspace has no analyses (e.g.,
the workspace was created but the analysis was interrupted), loading is aborted silently
and the user stays on the current view.

### Non-Topic Mode Re-hydration (PDF, URL, text)

```javascript
} else {
    setMode(ws.metadata.mode || "text");
    setResults({
        ...ws.analyses[0],          // spread first analysis as the result object
        _mode:        ws.metadata.mode,
        _input:       ws.metadata.query,
        workspace_id: id,
    });
}
```

For single-result modes, the first (and typically only) analysis in `analyses.json` is
spread directly into the results state. This restores the full analysis dict so ResultsPage
can render all sections (summary, keywords, research gaps, etc.).

### State after re-hydration

After `setResults()` and `setView("results")` are called:

```
App.jsx state:
    view             = "results"
    results          = { ...reconstructed from workspace }
    mode             = "topic" | "pdf" | "url" | "text"
    currentWorkspaceId = "<wid>"
    currentWorkspace = { metadata, papers, analyses, ideas, chat }
```

`ResultsPage` receives `results`, `mode`, and `workspaceId` as props and renders the
appropriate UI panels. The Sidebar marks the loaded workspace as active via the `currentId`
prop comparison.

---

## Storage Layer Design Notes

All reads and writes go through two private helpers in `storage.py`:

```python
def _read_json(path: str, default):
    """Read JSON file safely; return default if missing or corrupt."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default

def _write_json(path: str, data) -> None:
    """Write data to JSON file, creating parent dirs as needed."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
```

- `_read_json` returns the `default` argument on any `FileNotFoundError` or
  `json.JSONDecodeError`, so callers never need to handle missing files.
- `_write_json` creates parent directories with `exist_ok=True` before writing, so it is
  safe to call on a workspace that does not yet exist.
- `json.dump` uses `indent=2` (human-readable) and `ensure_ascii=False` (preserves Unicode
  characters in paper titles and author names).
- Writes are not atomic — a crash mid-write can produce a truncated JSON file. The
  `_read_json` fallback to `default` handles this case on next read.

The base directory is computed relative to `storage.py`'s own location:
```python
BASE_DIR = os.path.join(os.path.dirname(__file__), "data", "workspaces")
```

This means the `data/workspaces/` directory is always in the `backend/` folder, regardless
of the current working directory when `app.py` is started.
