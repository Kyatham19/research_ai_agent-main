# Pending Work

This file tracks features and work items that are incomplete, partially implemented, or blocked. Unlike [ENHANCEMENTS.md](ENHANCEMENTS.md) (which covers net-new ideas), items here already have scaffolding, stubs, or partial code in the repository — they are started but not finished.

When an item is completed, update its Status to "Done", move it to CHANGELOG.md, and check off the corresponding entry in [TODO.md](TODO.md).

**Status values:**
- **Not started** — scaffolding or placeholder exists but no implementation work begun
- **In progress** — active work under way on a branch
- **Blocked** — cannot proceed until an external dependency or decision is resolved

**Blocking? column** — "Yes" means this item blocks another feature from being usable end-to-end.

---

## Pending Work Table

| Item | Description | Status | Blocking? | Related files |
|---|---|---|---|---|
| **ideas.json feature** | `storage.py` creates an `ideas.json` file inside every new workspace directory and exposes a `save_ideas()` function. However, no Flask route calls `save_ideas()`, and there is no UI panel in `ResultsPage.jsx` to display research ideas. The entire "generate research ideas" feature is scaffolded but unimplemented. | Not started | No | `backend/storage.py`, `backend/app.py`, `backend/analyzer.py`, `frontend/src/pages/ResultsPage.jsx` |
| **Chat UI** | A `POST /api/workspaces/<wid>/chat` endpoint exists in `app.py` and `storage.py` writes chat turns to `chat.json`. However, `ResultsPage.jsx` and `Sidebar.jsx` have no chat interface — users cannot send messages or view chat history in the browser. The backend plumbing is in place; the frontend is missing entirely. | Not started | No | `backend/app.py`, `backend/storage.py`, `frontend/src/pages/ResultsPage.jsx`, `frontend/src/components/Sidebar.jsx` |
| **Literature review workspace integration** | The `POST /api/literature-review` endpoint accepts a `workspace_id` in its request body, but `generate_literature_review()` in `analyzer.py` does not use this parameter — the generated review is returned in the API response only and is never written to the workspace. This means literature reviews are lost on page refresh. | Not started | Yes — literature reviews cannot persist without this fix | `backend/app.py`, `backend/analyzer.py`, `backend/storage.py` |
| **Drag-and-drop paper reordering** | `@dnd-kit/core` and `@dnd-kit/sortable` are listed in `package.json` and installed in `node_modules`. The intended use is to let users drag papers into a preferred order before generating a literature review. No component in the frontend currently imports or uses either package. | Not started | No | `frontend/package.json`, `frontend/src/pages/ResultsPage.jsx` |
| **Authentication and multi-user support** | No authentication system exists. Every workspace is visible and writable by anyone with network access to the Flask server. There is no concept of a logged-in user; all workspaces are global. This is an architectural gap that affects all routes in `app.py` and all workspace operations in `storage.py`. | Not started | Yes — required before any public or shared deployment | `backend/app.py`, `backend/storage.py`, `frontend/src/App.jsx`, `frontend/src/pages/InputPage.jsx`, `frontend/src/components/Sidebar.jsx` |
| **Rate limiting on API endpoints** | Flask routes in `app.py` have no rate limiting. Any client can send unlimited requests to the Gemini-backed endpoints, potentially exhausting the Gemini API key quota rapidly. This is especially risky if the app is exposed beyond localhost. Flask-Limiter or a reverse-proxy-level rate limit would address this. | Not started | No | `backend/app.py`, `backend/requirements.txt` |
| **Workspace list pagination** | `list_workspaces()` in `storage.py` iterates over all workspace directories on every call and loads each `metadata.json` from disk. The `GET /api/workspaces` route returns the complete list with no limit or offset. With hundreds of workspaces the initial sidebar load will be noticeably slow. No pagination parameters exist on the route or in the storage function. | Not started | No | `backend/storage.py`, `backend/app.py`, `frontend/src/components/Sidebar.jsx` |
| **Favicon and app metadata** | `frontend/index.html` uses the default Vite boilerplate `<title>` and favicon. No custom icon file exists in `frontend/public/`. No Open Graph or Twitter Card `<meta>` tags are set. This affects browser tab labelling and link previews when sharing the app URL. | Not started | No | `frontend/index.html`, `frontend/public/` |
| **Persistent Gemini chat context** | Chat history is appended to `chat.json` in storage, but when a new chat message is sent to `POST /api/workspaces/<wid>/chat`, the existing history is not retrieved and included in the Gemini API call. Gemini therefore has no memory of prior turns in the conversation. The full conversation history needs to be loaded from storage and formatted as Gemini's `contents` array on each request. | Not started | No | `backend/app.py`, `backend/analyzer.py`, `backend/storage.py` |
| **Error surface for silent workspace creation failure** | When the workspace creation API call in `InputPage.jsx` fails (network error, disk full, permissions), the error is caught and `null` is returned. The code continues to call the analysis endpoint without a valid workspace ID, so results are returned to the user but never saved. No error is shown. Needs a visible error state and a guard that prevents analysis from proceeding without a workspace. | Not started | Yes — silent failure causes unsaved results | `frontend/src/pages/InputPage.jsx`, `backend/app.py` |

---

## Notes for Contributors

- Before starting any item above, check if a related branch already exists in the repository.
- Items marked **Blocking? = Yes** should be prioritised over non-blocking items of the same category.
- For items with existing backend scaffolding (ideas, chat), the backend route and storage layer should be implemented before the frontend UI is wired up.
- See [ENHANCEMENTS.md](ENHANCEMENTS.md) for net-new features that have no existing scaffolding.
