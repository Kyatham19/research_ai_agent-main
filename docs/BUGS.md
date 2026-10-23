# Known Bugs and Issues

This file tracks confirmed bugs and known issues in the Research AI Agent. Each entry includes the severity, affected files, and a workaround where one exists.

When a bug is fixed, remove its row from this table, check off the corresponding item in [TODO.md](TODO.md), and add a note to CHANGELOG.md.

For step-by-step diagnosis and resolution guidance, see [operations/troubleshooting.md](operations/troubleshooting.md).

**Severity scale:**
- **Critical** — data loss, server crash, or complete feature failure with no workaround
- **High** — major feature broken; workaround exists but is not user-friendly
- **Medium** — feature partially broken or degraded; workaround is reasonable
- **Low** — minor inconvenience, cosmetic issue, or edge-case failure

---

## Bug Table

| Bug | Description | Severity | Affected files | Workaround |
|---|---|---|---|---|
| **pymupdf not installable on Python 3.14** | `pymupdf` (fitz) cannot be installed on Python 3.14 because no official wheel is published and the source build fails. The app silently falls back to `pdfminer.six`, which is slower and less accurate for complex PDFs. | Medium | `backend/requirements.txt` (line 3), `backend/extractors.py` | Use Python 3.11 or 3.12 where a pymupdf wheel is available, or accept pdfminer.six as the PDF backend until a 3.14 wheel is released. |
| **Venv path hardcoded to original machine** | The Python interpreter path stored in `pyvenv.cfg` inside the virtual environment is absolute and points to the machine where the venv was created. If the project directory is copied to a different machine or a different user's home folder, the venv will reference a non-existent Python installation and all `pip` and `python` commands will fail. | High | `backend/venv/pyvenv.cfg` (if committed), local environment | Delete the venv directory and recreate it on the target machine: `python -m venv venv && pip install -r requirements.txt`. Never commit the `venv/` directory. |
| **arXiv category filter may miss papers for non-CS topics** | When processing a search query, `analyzer.py` asks Gemini to identify relevant arXiv categories. If Gemini returns wrong or overly narrow categories for a non-CS topic (e.g., biology, economics), relevant papers are missed. The hardcoded fallback `["cs.LG", "cs.AI"]` is only appropriate for machine learning topics and will return zero results for unrelated fields. | High | `backend/analyzer.py`, `backend/extractors.py` | For non-CS topics, manually include the correct arXiv category codes in the query, or broaden the search to use Semantic Scholar and OpenAlex (which do not rely on category filtering) as primary sources. |
| **OpenAlex abstract_inverted_index edge case** | Some OpenAlex API responses return a paper with `abstract_inverted_index` set to `None` or an empty dict `{}`. The `_reconstruct_abstract()` helper in `extractors.py` returns an empty string in this case, and the paper is subsequently skipped during analysis because it has no abstract. | Medium | `backend/extractors.py` | No user-facing workaround. The paper will simply be absent from results. A code fix should add a graceful fallback (e.g., use the title alone, or mark the paper with a flag rather than skipping it). |
| **PubMed rate limiting without NCBI API key** | Without an NCBI API key, the PubMed E-utilities API enforces a limit of 3 requests per second. Under high query volume or concurrent use, the extractor receives HTTP 429 responses. The current 0.35 s sleep between requests partially mitigates this but is insufficient under load. | Medium | `backend/extractors.py` | Set the `NCBI_API_KEY` environment variable with a free NCBI API key (register at https://www.ncbi.nlm.nih.gov/account/). With a key the rate limit increases to 10 req/s. |
| **LLM JSON parsing fails on large papers** | `analyze_paper_prompt` in `analyzer.py` truncates paper text to 7,000 characters before sending to Gemini. For long papers this can cut off critical sections (methods, results), causing Gemini to return incomplete or malformed JSON. The regex fallback parser in the response handler cannot recover partial JSON, so the entire analysis for that paper is lost. | High | `backend/analyzer.py` | No reliable workaround. Reducing the number of papers per batch (submit fewer papers at once) reduces the chance of any single paper being the one that fails. A proper fix requires either chunked analysis with summarisation or raising the truncation limit with a larger Gemini context window. |
| **`_mode` not always set on workspace reload** | When a workspace is loaded via the sidebar, if the saved `metadata.json` is missing the `mode` field (e.g., workspaces created by earlier versions of the app), the frontend defaults to `"text"` mode. This causes `ResultsPage.jsx` to render the wrong result template — for example, showing the text analysis view instead of the topic search view. | Medium | `backend/data/workspaces/*/metadata.json`, `frontend/src/pages/ResultsPage.jsx`, `frontend/src/components/Sidebar.jsx` | Open the workspace and manually re-submit the original query to regenerate results under the correct mode. A code fix should add a `mode` default in the workspace loader on both backend and frontend. |
| **No error shown when workspace creation fails silently** | In `InputPage.jsx`, the workspace creation API call failure is swallowed — the function returns `null` and analysis continues without a valid workspace ID. The analysis results are returned to the frontend normally but are never persisted to disk, so they disappear when the page is refreshed. The user sees no error message. | High | `frontend/src/pages/InputPage.jsx`, `backend/app.py` | Refresh the page and re-run the analysis. A code fix should surface the error in the UI and block analysis from proceeding if workspace creation fails. |
| **"Cannot connect to backend" shown after code changes without rebuilding frontend** | When source files under `frontend/src/` are edited, the `frontend/dist/` build is not automatically updated. Flask serves the stale compiled bundle, so UI logic changes (including API base URL, error messages, or request handling) are silently ignored. The frontend shows "Cannot connect to backend" if the stale bundle references a wrong API URL or has broken fetch logic. | High | `frontend/dist/` (stale build), `frontend/src/pages/Inputpage.jsx` | After any change to frontend source files, run `npm run build` inside `frontend/` before reloading the app at `http://localhost:5000`. The Vite dev server (`npm run dev`) avoids this by serving live source directly, but requires a separate port and CORS configuration. |

---

## Reporting a New Bug

If you discover a bug not listed here:

1. Check [operations/troubleshooting.md](operations/troubleshooting.md) first — it may already be documented with a fix.
2. Add a new row to the table above with all five columns filled in.
3. Add a corresponding item to [TODO.md](TODO.md) under the appropriate priority section.
4. If the bug is **Critical** or **High** severity, also note it in [PENDING-WORK.md](PENDING-WORK.md).
