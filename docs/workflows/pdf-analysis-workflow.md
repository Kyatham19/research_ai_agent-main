# PDF Analysis Workflow

## Overview

The PDF analysis workflow allows users to upload one or more research paper PDFs and receive
structured AI analysis of each paper. The pipeline extracts text from uploaded PDFs using a
two-library fallback chain (PyMuPDF then pdfminer.six), locates the Abstract and Introduction
sections to isolate the paper body, applies a multi-step text cleaning pass to remove noise
(emails, URLs, reference lists, affiliation lines, citation brackets), and then passes the
cleaned text to the same Gemini-powered analysis pipeline used by topic search. When multiple
PDFs are uploaded, an additional combined analysis is produced over the concatenated text of all
papers. All uploaded files and their analyses are saved to a file-based workspace.

---

## Flow Diagram

```
User (Browser)
    |
    |  drag & drop / file picker
    |  (.pdf files only — validated client-side)
    v
InputPage.jsx
    |
    |  1. createWorkspace(filenames.join(", "))
    |     POST /api/workspaces  →  { id }
    |
    |  2a. Single PDF:                    2b. Multiple PDFs:
    |      FormData: file=<blob>              FormData: files[]=<blob>, files[]=<blob>, ...
    |      workspace_id=<wid>                 workspace_id=<wid>
    |      POST /analyze/pdf                  POST /analyze/pdfs
    v
Flask route handler (app.py)
    |
    |  extract_from_pdf(file_obj)
    |      |
    |      |-- Try 1: PyMuPDF (fitz)
    |      |       fitz.open(stream=file_bytes, filetype="pdf")
    |      |       for page in doc: text += page.get_text()
    |      |
    |      |-- Try 2 (ImportError only): pdfminer.six
    |      |       extract_text_to_fp(file_obj, output, laparams=LAParams())
    |      |
    |      |-- On any other Exception: return None → HTTP 400
    |      v
    |  _extract_body(raw_text)
    |      |
    |      |-- Search for "Abstract" section header
    |      |       regex: \bAbstract\b ... (?=Introduction|Keywords|1\.|I\.)
    |      |       If found: extract abstract text + body from Introduction onward
    |      |
    |      |-- Else search for "Introduction" / "1." / "I."
    |      |       If found: return text from that point
    |      |
    |      |-- Else: skip first 50 lines (title/author block heuristic)
    |      v
    |  clean_pdf_text(body_text)
    |      |
    |      |-- strip email addresses
    |      |-- strip URLs (http/https, www.)
    |      |-- truncate at "References" / "Bibliography" / "Works Cited"
    |      |-- remove affiliation lines (\n\d+ Department|University|Institute...)
    |      |-- remove inline citation brackets ([42], (Smith, 2021))
    |      |-- filter lines shorter than 30 characters
    |      |-- collapse 3+ blank lines to 2
    |      |-- collapse multiple spaces
    |      v
    |  clean_extracted(text)
    |      |
    |      |-- collapse all whitespace to single spaces
    |      |-- split on sentence boundaries, filter sentences < 20 chars
    |      |-- rejoin with ". "
    |      |-- return None if result < 100 chars total
    |      v
    |  If None → HTTP 400 {"error": "Could not extract text"}
    |
    |  analyze_text(cleaned_text)    ← same pipeline as topic search
    |      |
    |      |-- Gemini: analyze_paper_prompt(text[:7000])
    |      |       10-question chain-of-thought protocol
    |      |       Returns 20+ field structured JSON
    |      |-- _validate_and_normalize()
    |      |-- Fallback: _fallback_analyze() on LLM failure
    |      v
    |  result['source'] = file.filename
    |
    |  [If wid present]:
    |      save_uploaded_file(wid, filename, file_bytes)
    |      save_analyses(wid, [result])
    |      update_metadata(wid, {mode: "pdf", query: filename})
    v
HTTP Response  →  InputPage.jsx  →  onResults()  →  App.jsx  →  ResultsPage
```

---

## Step-by-Step Flow

### Step 1: File Selection in the Browser

In `InputPage.jsx`, the PDF mode presents a drop zone `<div>` that accepts drag-and-drop
or a click to open the OS file picker. Only `.pdf` files are accepted:

```javascript
const pdfs = Array.from(newFiles).filter(f => f.name.endsWith(".pdf"));
if (!pdfs.length) { onError("Only PDF files supported."); return; }
```

Duplicate filenames (by name string) are filtered out on each addition:
```javascript
const names = new Set(prev.map(f => f.name));
return [...prev, ...pdfs.filter(f => !names.has(f.name))];
```

Selected files are displayed as removable chips. The user controls the list before submitting.

---

### Step 2: Workspace Creation

Before the upload request, `createWorkspace()` is called with the comma-joined filename list
as the query string:

```
POST /api/workspaces
Body: { "query": "paper1.pdf, paper2.pdf" }
```

Returns `{ id: "<8-char-uuid>", ... }`. The workspace is created empty at this point;
files and analyses are saved by the backend after extraction.

---

### Step 3: Multipart Upload

**Single PDF:**
```
POST /analyze/pdf
Content-Type: multipart/form-data

file=<binary PDF>
workspace_id=<wid>
```

**Multiple PDFs:**
```
POST /analyze/pdfs
Content-Type: multipart/form-data

files[]=<binary PDF 1>
files[]=<binary PDF 2>
...
workspace_id=<wid>
```

Flask reads the file object(s) from `request.files`. The raw bytes are passed to
`extract_from_pdf(file_obj)`. The file object must be seekable because the backend
may read it twice — once for text extraction, and once to save the binary to disk.

---

### Step 4: PDF Text Extraction

**File:** `backend/extractors.py` — `extract_from_pdf(file_obj)`

#### Try 1: PyMuPDF (`fitz`)

```python
import fitz
file_bytes = file_obj.read()
doc = fitz.open(stream=file_bytes, filetype="pdf")
text = ""
for page in doc:
    text += page.get_text()
doc.close()
```

PyMuPDF is the preferred extractor because it handles complex layouts, multi-column PDFs,
and embedded fonts better than pure-Python alternatives. It is the default if the `fitz`
package is installed (`PyMuPDF` on PyPI).

#### Try 2: pdfminer.six (ImportError fallback only)

If `import fitz` raises `ImportError` (package not installed), pdfminer.six is tried:

```python
from pdfminer.high_level import extract_text_to_fp
from pdfminer.layout import LAParams
file_obj.seek(0)
output = io.StringIO()
extract_text_to_fp(file_obj, output, laparams=LAParams())
text = output.getvalue()
```

`LAParams()` (Layout Analysis Parameters) uses default settings for line margin, word
margin, and character margin. This handles typical two-column academic paper layouts
reasonably well, though less accurately than PyMuPDF for complex documents.

Note: Try 2 activates **only on `ImportError`**, not on runtime errors in PyMuPDF.
If PyMuPDF is installed but raises a runtime error (e.g., corrupted PDF), the exception
falls through to the outer `except Exception` clause, and `None` is returned.

#### Failure — returns None → HTTP 400

If both extraction paths fail (or raw text is returned as `None` by `clean_extracted()`),
`extract_from_pdf()` returns `None`. The route handler checks:

```python
text = extract_from_pdf(file)
if not text:
    return jsonify({"error": "Could not extract text"}), 400
```

The frontend catches `!res.ok` and shows an error toast.

---

### Step 5: Body Extraction

**File:** `backend/extractors.py` — `_extract_body(text)`

Academic PDFs have significant noise at the start (title, author list, affiliations,
abstract header, keywords, DOI). `_extract_body()` locates the substantive content.

**Strategy 1 — Abstract + Introduction (preferred):**

```python
abstract_match = re.search(
    r"\bAbstract\b[:\s—–-]*(.*?)"
    r"(?=\b(Introduction|Keywords|Index Terms|1\.|I\.)\b)",
    text, re.DOTALL | re.IGNORECASE,
)
```

If matched:
- `abstract = abstract_match.group(1).strip()` — the abstract body text
- An additional `re.search` finds the start of `Introduction` / `1.` / `I.`
- Returns: `abstract + "\n\n" + body_from_introduction`

This gives the analysis the abstract (dense, high-information summary) plus the full
body of the paper, while skipping the title/author block that appears before the Abstract.

**Strategy 2 — Introduction only (no Abstract match):**

If the Abstract section is not found (e.g., the PDF uses "Summary" instead, or the text
order was scrambled during extraction), the function searches for the Introduction section:

```python
intro_match = re.search(r"\b(Introduction|1\.|I\.)\b", text, re.IGNORECASE)
if intro_match:
    return text[intro_match.start():]
```

**Strategy 3 — Skip first 50 lines (last resort):**

If neither Abstract nor Introduction is found (common in some thesis chapters or
non-standard PDF layouts), the function skips the first 50 lines of text:

```python
lines = text.split("\n")
body = "\n".join(lines[50:])
return body if len(body.strip()) > 200 else text
```

If skipping 50 lines leaves fewer than 200 characters (very short PDF), the full raw
text is returned unchanged.

---

### Step 6: PDF-Specific Text Cleaning

**File:** `backend/extractors.py` — `clean_pdf_text(text)`

Applied after `_extract_body()`. Removes categories of noise specific to academic PDFs:

| Cleaning operation | Pattern | Purpose |
|-------------------|---------|---------|
| Remove email addresses | `\b[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}\b` | Author emails in headers |
| Remove URLs | `https?://\S+`, `www\.\S+` | Hyperlinks embedded in text |
| Truncate at references | `\b(References|Bibliography|REFERENCES|Works Cited)\b.*` (DOTALL) | Remove entire reference section |
| Remove affiliation lines | `\n\d+\s*(Department|University|Institute|College|School)[^\n]*` | Numbered affiliations |
| Remove citation brackets | `\[\d+\]` | Inline numeric citations like [42] |
| Remove author-year citations | `\(\w+,\s*\d{4}\)` | Inline citations like (Smith, 2021) |
| Filter short lines | Lines < 30 characters removed | Page headers, footers, figure labels |
| Collapse blank lines | `\n{3,}` → `\n\n` | Normalize whitespace |
| Collapse spaces | ` {2,}` → ` ` | Double spaces from PDF extraction |

---

### Step 7: General Text Cleaning

**File:** `backend/extractors.py` — `clean_extracted(text)`

Applied after `clean_pdf_text()`. Final normalization pass:

1. Collapse all whitespace (including newlines) to single spaces: `re.sub(r"\s+", " ", text)`
2. Split on sentence boundaries (`.`, `!`, `?` followed by space)
3. Filter out sentence fragments shorter than 20 characters
4. Rejoin with `". "`
5. Return `None` if the result is shorter than 100 characters (indicates extraction failure)

---

### Step 8: Paper Analysis

`analyze_text(cleaned_text)` is called with the cleaned body text.
This is identical to the per-paper analysis in the topic search pipeline.

The Gemini prompt (`analyze_paper_prompt`) receives up to the first 7,000 characters.
For a typical 8-page PDF, the abstract plus first two sections usually fall within this limit.

The result is a 20+ field structured dict. The route handler then sets:
```python
result['source'] = file.filename
```

For single PDFs, the route also sets the title to the filename:
```python
# In /analyze/pdfs
a['title'] = file.filename
a['source'] = file.filename
```

---

### Step 9: Storage

**File:** `backend/storage.py`

For each successfully extracted PDF:

```python
file.seek(0)
save_uploaded_file(wid, file.filename, file.read())
# Writes binary to: data/workspaces/workspace_<wid>/uploads/<filename>
```

```python
save_analyses(wid, [result])
# Writes to: data/workspaces/workspace_<wid>/analyses.json
```

```python
update_metadata(wid, {"mode": "pdf", "query": file.filename})
# Merges into: data/workspaces/workspace_<wid>/metadata.json
```

---

## Single vs. Multi-PDF Differences

| Aspect | Single PDF (`/analyze/pdf`) | Multiple PDFs (`/analyze/pdfs`) |
|--------|----------------------------|--------------------------------|
| Request field | `file` (singular) | `files` (list) |
| Route | `POST /analyze/pdf` | `POST /analyze/pdfs` |
| Per-paper analysis | 1 call to `analyze_text()` | 1 call per successfully extracted PDF |
| Combined analysis | None — single result | `analyze_text(all_text_concatenated)` if >1 paper |
| Title field | Not set (only `source`) | `result['title'] = file.filename` for each |
| Response shape | Single analysis dict | `{papers: [], combined: {}, paper_count: N}` |
| Storage | `save_analyses(wid, [result])` | `save_analyses(wid, results)` — all in one write |

### Combined Analysis Path (multi-PDF only)

After analyzing each PDF individually, all cleaned texts are concatenated:
```python
all_text += " " + text  # accumulated across the loop
```

Then:
```python
combined = analyze_text(all_text) if len(results) > 1 else results[0]
combined['title'] = f"Combined: {len(results)} PDFs"
```

This sends the full concatenated text of all papers to Gemini as a single analysis request.
Because `analyze_paper_prompt` truncates to `text[:7000]` characters, only the leading
portion of the concatenated text is used for the combined analysis. For large batches,
the combined analysis effectively reflects the first one or two papers' content in depth.

**PDFs that fail extraction are silently skipped.** If no PDF in the batch can be
extracted, a 400 error is returned:
```python
if not results:
    return jsonify({"error": "Could not extract text from any PDF"}), 400
```

---

## PDF Extraction Fallback Chain

```
extract_from_pdf(file_obj)
    |
    +-- import fitz  ──► success?
    |       |                |
    |       | No (ImportError) |
    |       |           Yes → fitz.open(stream=...) → page.get_text()
    |       |                     |
    |       |              Success? ──► Yes → _extract_body() → clean_pdf_text() → clean_extracted()
    |       |                     |
    |       |              Error (runtime) → return None → HTTP 400
    |       |
    |       v (ImportError)
    +-- from pdfminer.high_level import extract_text_to_fp
            |
            Success? ──► Yes → extract_text_to_fp() → _extract_body() → clean_pdf_text() → clean_extracted()
            |
            Error → print error → return None → HTTP 400
```

Both successful paths produce `str | None`. A `None` return from `clean_extracted()`
(text < 100 chars after cleaning) also propagates as `None` to the route handler,
which returns HTTP 400.

---

## Cleaning Steps Summary

```
Raw PDF binary
    ↓
[PyMuPDF or pdfminer.six]
    ↓
Raw extracted text (may include title, authors, affiliations, abstract, body,
                     references, figures, footnotes, headers, footers)
    ↓
_extract_body()
    → locates Abstract + Introduction boundary
    → returns abstract text + paper body, skipping title/author block
    ↓
clean_pdf_text()
    → strips emails, URLs
    → truncates at References section
    → removes affiliation lines
    → removes citation brackets [42] and (Smith, 2021)
    → filters lines < 30 chars (headers, footers, figure labels)
    → normalizes whitespace
    ↓
clean_extracted()
    → collapses all whitespace to single spaces
    → filters sentence fragments < 20 chars
    → returns None if < 100 chars total
    ↓
Cleaned body text (ready for Gemini analysis)
```
