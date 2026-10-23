# Enhancements Backlog

This file tracks planned feature enhancements for the Research AI Agent. Items here are legitimate future directions derived from the current codebase — either scaffolded but not yet wired up, or identified as valuable additions based on the existing architecture.

Items are not committed to any release milestone unless explicitly noted. See [TODO.md](TODO.md) for the actionable checklist and [PENDING-WORK.md](PENDING-WORK.md) for items where partial implementation already exists.

---

## Enhancement Table

| Enhancement | Description | Priority | Related files |
|---|---|---|---|
| **Authentication and multi-user support** | Currently no auth exists; all workspaces are shared locally on the server filesystem. Add user accounts (e.g., via Flask-Login or a token-based system) so each user has isolated, private workspaces. Workspace directories would be namespaced per user. | High | `backend/app.py`, `backend/storage.py`, `frontend/src/pages/InputPage.jsx`, `frontend/src/components/Sidebar.jsx` |
| **Chat with papers (RAG)** | The `chat.json` file is already created per workspace by `storage.py`, and a `POST /api/workspaces/<wid>/chat` endpoint exists in `app.py`, but no frontend chat UI is implemented. Build a RAG chat interface where users can ask natural-language questions and Gemini answers in context of the workspace's retrieved papers. | High | `backend/app.py`, `backend/storage.py`, `frontend/src/pages/ResultsPage.jsx`, `frontend/src/components/Sidebar.jsx` |
| **Literature review saves to workspace** | The `generate_literature_review()` call accepts a `workspace_id` parameter in the POST body but the implementation ignores it — results are returned in the API response only and never persisted. Wire it up so the generated review is saved back to the workspace. | High | `backend/app.py`, `backend/analyzer.py`, `backend/storage.py` |
| **Export features** | Allow users to export analysis results as a formatted PDF report, a Word document (.docx), or a BibTeX citation list. A BibTeX export is particularly useful for researchers importing citations into LaTeX or reference managers. | Medium | `backend/app.py`, `frontend/src/pages/ResultsPage.jsx` |
| **Research idea generation (ideas.json activation)** | `storage.py` already creates an `ideas.json` file per workspace and has a `save_ideas()` function, but no route or UI invokes it. Implement a "Generate Research Ideas" feature that sends the workspace's paper abstracts and analysis to Gemini with a dedicated prompt and stores the result in `ideas.json`. Add a UI panel in `ResultsPage.jsx` to display the ideas. | Medium | `backend/app.py`, `backend/analyzer.py`, `backend/storage.py`, `frontend/src/pages/ResultsPage.jsx` |
| **Persistent Gemini chat context** | Chat history is stored in `chat.json` per workspace but is not sent back to Gemini on subsequent turns. Wire up the chat history so Gemini responds with full awareness of the conversation and the workspace's papers, enabling multi-turn research Q&A. | Medium | `backend/app.py`, `backend/analyzer.py`, `backend/storage.py` |
| **Paper recommendation** | Based on the papers already in a workspace, call the Semantic Scholar or OpenAlex recommendations API to surface related papers the user may have missed. Display recommendations in a separate panel in `ResultsPage.jsx`. | Medium | `backend/extractors.py`, `backend/app.py`, `frontend/src/pages/ResultsPage.jsx` |
| **Drag-and-drop paper reordering** | `@dnd-kit/core` and `@dnd-kit/sortable` are already installed in `package.json` but are not wired up in any component. The intended use is reordering papers in the literature review selector. Implement sortable paper cards using the installed library. | Medium | `frontend/src/pages/ResultsPage.jsx`, `frontend/package.json` |
| **Export as BibTeX** | Generate a BibTeX file from the DOIs and metadata of papers in a workspace. This is a subset of the broader export feature and can be shipped independently. | Medium | `backend/app.py`, `frontend/src/pages/ResultsPage.jsx` |
| **Scheduled topic monitoring** | Let users subscribe to a topic query and receive notifications (email or webhook) when new papers matching that query are published on arXiv or PubMed. Requires a background scheduler (e.g., APScheduler) and a notification delivery mechanism. | Low | `backend/extractors.py`, `backend/app.py` |
| **Collaborative workspaces** | Generate a shareable read-only or read-write link for a workspace so collaborators can view papers and analysis without needing server access. Requires at minimum a token-based URL scheme and optionally an auth layer. | Low | `backend/app.py`, `backend/storage.py` |
| **Citation graph visualization** | Visualize how papers in a workspace cite each other using DOI cross-reference data from Semantic Scholar or OpenAlex. Render the graph in the frontend using a library such as D3.js or react-force-graph. | Low | `backend/extractors.py`, `frontend/src/pages/ResultsPage.jsx` |
| **Better PDF support via OCR** | The current PDF extractor (`backend/extractors.py`) uses pdfminer.six for text extraction, which fails on scanned (image-only) PDFs. Integrate Tesseract OCR (via pytesseract) as a fallback for scanned documents. | Low | `backend/extractors.py`, `backend/requirements.txt` |
| **PyMuPDF Python 3.14 wheel** | PyMuPDF (fitz) is commented out of `requirements.txt` because no official wheel exists for Python 3.14 yet (source build fails). Once an official wheel is published, add `pymupdf` back to requirements for significantly faster and more accurate PDF text extraction. | Low | `backend/requirements.txt`, `backend/extractors.py` |
| **Pluggable paper source system** | Refactor the four hardcoded extractors (arXiv, Semantic Scholar, OpenAlex, PubMed) in `extractors.py` into a plugin interface so the community can add new academic databases without modifying core code. | Low | `backend/extractors.py`, `backend/app.py` |
| **Workspace list pagination** | `list_workspaces()` in `storage.py` loads all workspace metadata from disk on every call. With hundreds of workspaces this becomes slow. Add pagination (limit/offset) to the `GET /api/workspaces` route and update the sidebar to load workspaces incrementally. | Low | `backend/storage.py`, `backend/app.py`, `frontend/src/components/Sidebar.jsx` |
| **Custom favicon and app metadata** | The frontend currently uses the default Vite favicon. Add a custom icon and Open Graph metadata (`<meta>` tags for title, description, image) to `index.html`. | Low | `frontend/index.html`, `frontend/public/` |

---

## How to Contribute an Enhancement

1. Pick an item from the table above (or propose a new one by opening a discussion).
2. Check [PENDING-WORK.md](PENDING-WORK.md) — partial scaffolding may already exist.
3. Check [TODO.md](TODO.md) and mark the item as in-progress.
4. Implement the feature on a dedicated branch.
5. When shipped, remove the row from this table and add a CHANGELOG.md entry describing what was delivered.

For questions about architecture or prompt design before implementing, see [design/HLD.md](design/HLD.md) and [api/llm-prompts.md](api/llm-prompts.md).
