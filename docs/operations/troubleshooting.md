# Troubleshooting Guide — Research AI Agent

## Table of Contents

1. [Quick Diagnostic Checklist](#quick-diagnostic-checklist)
2. [Diagnostic Commands](#diagnostic-commands)
3. [Known Issues and Fixes](#known-issues-and-fixes)
   - [GEMINI_API_KEY Not Set](#gemini_api_key-not-set)
   - [Python 3.14 — pymupdf Won't Install](#python-314--pymupdf-wont-install)
   - [Broken venv (Wrong Machine)](#broken-venv-wrong-machine)
   - [Frontend Shows Blank Page or Wrong App](#frontend-shows-blank-page-or-wrong-app)
   - [No Papers Found for This Topic](#no-papers-found-for-this-topic)
   - [PDF Extraction Returns None](#pdf-extraction-returns-none)
   - [Port 5000 Already in Use](#port-5000-already-in-use)
4. [Log Output Guidance](#log-output-guidance)
5. [API Error Reference](#api-error-reference)

---

## Quick Diagnostic Checklist

Run through this list top-to-bottom when the app is misbehaving. Most issues are caught by step 4.

```
[ ] 1. Is the venv active?
        python -c "import sys; print(sys.prefix)"
        Expected: path ending in backend/venv

[ ] 2. Are all Python packages installed?
        python -c "import flask, flask_cors, google.generativeai, dotenv"
        Expected: no output (no error)

[ ] 3. Does backend/.env exist with a valid GEMINI_API_KEY?
        type backend\.env            (Windows)
        cat backend/.env             (Linux/macOS)
        Expected: GEMINI_API_KEY=AIza...

[ ] 4. Does the health endpoint respond and show api_key_configured: true?
        curl http://localhost:5000/health
        Expected: {"status": "ok", "llm": "gemini-2.5-flash", "api_key_configured": true}

[ ] 5. Does frontend/dist/ exist and contain index.html?
        dir frontend\dist\index.html         (Windows)
        ls frontend/dist/index.html          (Linux/macOS)
        Expected: file is present

[ ] 6. Is port 5000 free (before starting)?
        netstat -ano | findstr :5000         (Windows)
        lsof -i :5000                        (Linux/macOS)
        Expected: no output

[ ] 7. Can the server reach external APIs?
        curl "https://api.semanticscholar.org/graph/v1/paper/search?query=neural+networks&limit=1"
        Expected: HTTP 200 with JSON
```

---

## Diagnostic Commands

### Check which Python is being used

```bash
# Windows
where python

# Linux/macOS
which python
```

Expected output when venv is active: path inside `backend/venv/`.

### Verify all packages are installed

```bash
cd backend
python -c "import flask, flask_cors, google.generativeai, dotenv, pdfminer; print('all ok')"
```

If any import fails, reinstall dependencies:

```bash
pip install -r requirements.txt
```

### Test the API key

```bash
cd backend
python -c "
from dotenv import load_dotenv
load_dotenv()
import os
key = os.environ.get('GEMINI_API_KEY', '')
print('Key present:', bool(key))
print('Key prefix:', key[:8] + '...' if key else 'MISSING')
"
```

### Verify the Gemini API key is valid

```bash
cd backend
python -c "
from dotenv import load_dotenv
load_dotenv()
import google.generativeai as genai
import os
genai.configure(api_key=os.environ.get('GEMINI_API_KEY', ''))
model = genai.GenerativeModel('gemini-2.5-flash')
r = model.generate_content('Say OK')
print(r.text)
"
```

Expected output: `OK` (or similar). If you see an `API key not valid` error, the key in `backend/.env` is wrong or has been revoked.

### Check that frontend/dist/ exists and is current

```bash
# Windows
dir "frontend\dist"

# Linux/macOS
ls -la frontend/dist/
```

Expected: `index.html` and an `assets/` directory present. If missing, run:

```bash
cd frontend && npm run build
```

### Check port 5000

```bash
# Windows
netstat -ano | findstr :5000

# Linux/macOS
lsof -i :5000
```

If a process is shown, see [Port 5000 Already in Use](#port-5000-already-in-use).

### Test external API connectivity

```bash
# Semantic Scholar
curl "https://api.semanticscholar.org/graph/v1/paper/search?query=transformer&limit=1"

# arXiv
curl "https://export.arxiv.org/api/query?search_query=ti:transformer&max_results=1"

# OpenAlex
curl "https://api.openalex.org/works?search=transformer&per-page=1"

# PubMed (only relevant for medical topics)
curl "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=cancer&retmax=1&retmode=json"
```

All should return HTTP 200. Failures indicate network issues or API rate limiting.

---

## Known Issues and Fixes

---

### GEMINI_API_KEY Not Set

**Error message:**

```
EnvironmentError: GEMINI_API_KEY not set.
```

This appears in the Flask terminal log and the client receives a 500 Internal Server Error on any analysis endpoint.

**Root cause:** `backend/.env` does not exist, is missing the `GEMINI_API_KEY` line, or the key value is empty.

**Step-by-step fix:**

1. Obtain a key from [aistudio.google.com](https://aistudio.google.com) (free account works).

2. Create `backend/.env`:
   ```
   GEMINI_API_KEY=AIzaSyYOURACTUALKEYHERE
   ```
   Important: no quotes around the value, no spaces around `=`.

3. Restart the Flask server (the file is loaded once at startup via `load_dotenv()`).

4. Verify:
   ```bash
   curl http://localhost:5000/health
   # Expected: "api_key_configured": true
   ```

**Also check:** If the file exists but the key still appears missing, verify there are no hidden characters or BOM in the file. Re-create it with a plain text editor if in doubt.

---

### Python 3.14 — pymupdf Won't Install

**Error message:**

```
ERROR: Failed to build installable wheels for some pyproject.toml based projects (pymupdf)
  ...
  Failed to build 'pymupdf' when installing build dependencies.
```

Or:

```
error: failed to download libclang
```

**Root cause:** `pymupdf==1.23.8` has no prebuilt wheel for Python 3.14. Building from source requires libclang, which fails to download due to network timeouts or missing build toolchain.

**Fix:** Skip pymupdf entirely. The app detects its absence at runtime and falls back to `pdfminer.six` for PDF text extraction automatically (see `extract_from_pdf()` in `backend/extractors.py`). Use this install command instead of `pip install -r requirements.txt`:

```bash
pip install flask==3.0.0 flask-cors==4.0.0 pdfminer.six==20221105 requests==2.31.0 google-generativeai==0.7.2 python-dotenv==1.0.0
```

**Functional impact:** `pdfminer.six` is slightly slower and may produce more whitespace artifacts than pymupdf on complex PDFs, but text extraction works correctly for standard academic papers.

**On Python 3.10 / 3.11 / 3.12:** `pip install pymupdf==1.23.8` installs from a prebuilt wheel without any issues.

---

### Broken venv (Wrong Machine)

**Error messages:**

```
Error: No Python at 'D:\other\user\path\backend\venv\Scripts\python.exe'
```

or:

```
ModuleNotFoundError: No module named 'flask'
```

or on Windows, attempting to activate the venv:

```
The system cannot find the path specified.
```

**Root cause:** The `backend/venv/` directory was created on a different machine or by a different user. Python virtual environments embed the absolute path to the Python interpreter in their activation scripts and are not portable across machines. The venv must be recreated on each machine.

**Step-by-step fix:**

1. Delete the broken venv:
   ```bash
   # Windows
   rmdir /s /q backend\venv

   # Linux/macOS
   rm -rf backend/venv
   ```

2. Create a fresh venv:
   ```bash
   cd backend
   python -m venv venv
   ```

3. Activate it:
   ```bash
   # Windows
   venv\Scripts\activate

   # Linux/macOS
   source venv/bin/activate
   ```

4. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

5. Verify:
   ```bash
   python -c "import flask; print(flask.__version__)"
   # Expected: 3.0.0
   ```

---

### Frontend Shows Blank Page or Wrong App

**Symptoms:**
- Browser shows a blank white page at `http://localhost:5000`
- Browser shows a Werkzeug/Flask error page instead of the React UI
- Browser shows a stale version of the UI that does not reflect recent code changes

**Root cause:** `frontend/dist/` does not exist or contains an outdated build. Flask's `static_folder='../frontend/dist'` setting means Flask serves whatever is in that directory (or returns 404/500 if the directory is absent).

**Step-by-step fix:**

1. Build the frontend:
   ```bash
   cd frontend
   npm install        # only needed if node_modules/ is missing
   npm run build
   ```

2. Verify the build output:
   ```bash
   # Windows
   dir frontend\dist\index.html

   # Linux/macOS
   ls frontend/dist/index.html
   ```

3. Restart the Flask server (Flask caches static file lookups):
   ```bash
   # Stop Flask (Ctrl+C), then restart:
   cd backend
   python app.py
   ```

4. Hard-refresh the browser (Ctrl+Shift+R / Cmd+Shift+R) to clear the browser's own cache.

**Note:** The frontend must be rebuilt after every change to files under `frontend/src/`. The Flask server does not hot-reload frontend assets.

---

### No Papers Found for This Topic

**Error response:**

```json
{"error": "No papers found for this topic"}
```

HTTP status: 404

**Root causes and fixes:**

**1. All retrieved papers scored below `RELEVANCE_THRESHOLD=20`**

This is the most common cause. The LLM-based relevance scorer or the keyword fallback gave all retrieved papers a composite score below 20.

Fix options:
- Try a broader or differently phrased version of the topic (e.g., "neural network" instead of "ResNet-50 on CIFAR-10 with label noise")
- Temporarily lower `RELEVANCE_THRESHOLD` in `backend/extractors.py`:
  ```python
  RELEVANCE_THRESHOLD = 10  # was 20
  ```
  Restart Flask and retry. Raise it back once you find a query that works.

**2. External APIs returned 0 results**

Check each API manually:

```bash
# Replace YOUR_TOPIC with your search query
curl "https://api.semanticscholar.org/graph/v1/paper/search?query=YOUR_TOPIC&limit=5"
curl "https://export.arxiv.org/api/query?search_query=abs:YOUR_TOPIC&max_results=5"
```

If these return empty result sets, the topic is genuinely not in the academic databases, or the queries generated by `expand_topic()` did not match anything.

**3. Network connectivity issue**

One or more external sources (arXiv, Semantic Scholar, OpenAlex, PubMed) timed out. Flask logs will show lines like:

```
  [arXiv] error for query 'quantum computing': <URLError reason='timed out'>
  [Semantic Scholar] error for query 'quantum computing': HTTP Error 429: Too Many Requests
```

Fix: Check internet connectivity. Wait and retry if rate-limited (429).

**4. arXiv category filter too narrow**

The topic expansion LLM may assign arXiv categories that don't match how papers are actually categorized on arXiv. For example, a medical imaging paper might be under `eess.IV` but the expander may only return `cs.CV`.

Fix: Use `/analyze/url` or `/analyze/text` as an alternative — submit a specific paper URL or paste abstract text directly.

---

### PDF Extraction Returns None

**Error response:**

```json
{"error": "Could not extract text"}
```

HTTP status: 400

**Root cause:** The uploaded PDF is image-based (scanned document). It contains no extractable text layer — only rasterized images of pages. Neither pymupdf nor pdfminer.six can extract text from image-only PDFs without OCR.

**Step-by-step fix:**

1. Confirm the PDF is scanned: open it, try to select text with the cursor. If no text is selectable, it is an image-based PDF.

2. Use an OCR tool to add a text layer:
   - [Adobe Acrobat](https://www.adobe.com/acrobat/online/pdf-ocr.html) (paid)
   - [OCRmyPDF](https://ocrmypdf.readthedocs.io/) (free, open source):
     ```bash
     pip install ocrmypdf
     ocrmypdf input.pdf output.pdf
     ```
   - Online tools: SmallPDF, ILovePDF

3. Upload the OCR-processed PDF to the app, or copy the extracted text and use `/analyze/text`.

**Alternative:** If you have the paper abstract or full text available online, use `/analyze/url` with the paper's URL (arXiv, PubMed, DOI link), or paste the text into the text input.

---

### Port 5000 Already in Use

**Error message:**

```
OSError: [Errno 98] Address already in use
```

or on Windows:

```
OSError: [WinError 10048] Only one usage of each socket address (protocol/network address/port) is normally permitted
```

**Root cause:** Another process is already listening on port 5000. Common culprits: a previous Flask instance that did not shut down cleanly, or on macOS, the AirPlay Receiver service.

**Fix — Windows:**

```bash
# Find the PID using port 5000
netstat -ano | findstr :5000

# Kill the process (replace <PID> with the number from the output)
taskkill /PID <PID> /F
```

**Fix — Linux/macOS:**

```bash
# Find and kill the process in one command
lsof -ti:5000 | xargs kill -9
```

**Alternative — change the port:**

If you cannot free port 5000 (e.g., the conflict is a system service), change the Flask port instead. Edit `backend/app.py`:

```python
# Change 5000 to any available port (e.g., 5001, 8000, 8080)
if __name__ == '__main__':
    app.run(debug=True, port=5001)
```

Restart Flask. Access the app at `http://localhost:5001`.

---

## Log Output Guidance

### Flask debug mode log

When running `python app.py` with `debug=True`, Flask prints all request logs to the terminal:

```
 * Running on http://127.0.0.1:5000
 * Debug mode: on
127.0.0.1 - - [14/Jun/2026 10:32:01] "POST /analyze/topic HTTP/1.1" 200 -
```

The application also prints detailed pipeline progress for topic searches:

```
============================================================
  RESEARCH RETRIEVAL: 'transformer architecture'
============================================================
  [Topic Intelligence] canonical='Transformer Architecture' domain=computer_science is_medical=False
  [Topic Intelligence] queries: ['transformer self-attention mechanism', ...]
  [arXiv] returned 24 raw papers
  [Semantic Scholar] returned 18 raw papers
  [OpenAlex] returned 15 raw papers
  [PubMed] returned 0 raw papers
  Total raw papers before dedup: 57
  After deduplication: 41 unique papers
  [Relevance LLM] scored 41/41 papers
  After relevance filter (threshold=20): 12 papers
  Returning top 10 papers
============================================================
```

This output is useful for diagnosing why a search returns few or no results.

### Warnings to ignore

These messages appear in normal operation and do not indicate errors:

```
WARNING: This is a development server. Do not use it in a production deployment.
```
Expected when running with `python app.py`. Use gunicorn/waitress for production.

```
  [Topic Intelligence] LLM expansion failed (timeout), using defaults
```
The topic expansion LLM call timed out. The pipeline falls back to simpler keyword queries. Results may be slightly less targeted but the search will still run.

```
  [Relevance LLM] failed (JSON parse error), using keyword fallback
```
The relevance scoring LLM returned malformed JSON. The pipeline falls back to keyword overlap scoring. Results will still be returned but relevance ranking may be less accurate.

```
  [arXiv] error for query 'X': <urlopen error timed out>
```
The arXiv API timed out for one query. Other sources continue in parallel. If all sources time out simultaneously, check network connectivity.

```
PDF extraction error: ...
```
A specific PDF could not be processed. If you uploaded multiple PDFs, the others are still processed.

### Enabling more verbose logging

To see all HTTP headers and request bodies (useful for debugging API integration issues), add to `backend/app.py` before `app.run()`:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

This is very verbose — use temporarily and remove afterward.

---

## API Error Reference

| HTTP Status | JSON error field | Meaning | Fix |
|-------------|-----------------|---------|-----|
| `400` | `"No text provided"` | `/analyze/text` received empty body | Provide non-empty `text` field |
| `400` | `"No file uploaded"` | `/analyze/pdf` received no file | Attach file with key `file` |
| `400` | `"Could not extract text"` | PDF is image-based | OCR the PDF first; or use `/analyze/text` |
| `400` | `"No files uploaded"` | `/analyze/pdfs` received no files | Attach files with key `files` |
| `400` | `"No URL provided"` | `/analyze/url` received empty URL | Provide non-empty `url` field |
| `400` | `"Could not extract content"` | URL fetch or parse failed | Check URL is accessible; try arXiv abstract URL |
| `400` | `"Empty message"` | Chat message content is empty | Provide non-empty `content` field |
| `400` | `"At least 2 papers required"` | `/api/literature-review` received < 2 papers | Select at least 2 papers before generating review |
| `400` | `"title and research_question required"` | `/api/paper-draft` missing required fields | Fill in Title and Research Question fields |
| `429` | `"Gemini API rate limit exceeded..."` | `/api/paper-draft` hit free-tier quota | Wait ~1 minute and retry; or change the API key |
| `400` | `"No topic provided"` | `/analyze/topic` received empty topic | Provide non-empty `topic` field |
| `404` | `"No papers found for this topic"` | All papers below relevance threshold | See [No Papers Found](#no-papers-found-for-this-topic) |
| `404` | `"Not found"` | Workspace ID does not exist | Check workspace ID; it may have been deleted |
| `500` | (Flask traceback) | Unhandled exception | Check Flask terminal log for full traceback |
