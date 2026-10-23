# Code Review — Research AI Agent

**Date:** 2026-06-14
**Scope:** Uncommitted working-tree changes (`git diff HEAD`) — 3,889 insertions / 1,130 deletions across 21 files
**Reviewer:** Claude Code (automated, high-effort)
**Method:** 7 finder angles (Angles A–G); 2 completed before session-limit; critical findings verified directly against source

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High     | 3 |
| Security | 1 |
| Medium   | 1 |
| Low      | 3 |
| **Total**| **9** |

The dominant issue is a **dict-vs-list shape mismatch** introduced by the new structured `research_gaps` and `future_scope` fields in `analyze_text()`. Four of the nine findings share this root cause and silently corrupt the multi-paper synthesis pipeline. One critical correctness bug (`is_medical: false` treated as falsy) means every non-medical topic search bypasses the LLM's topic intelligence and uses generic fallback queries.

---

## Findings

### 1. `is_medical: false` always triggers LLM fallback — every non-medical topic uses generic queries
**Severity:** Critical
**File:** [backend/extractors.py](../backend/extractors.py#L67)
**Line:** 67

```python
for key in required:
    if key not in result or not result[key]:   # ← BUG
        raise ValueError(f"Missing or empty key: {key}")
```

**Root cause:** `not result["is_medical"]` evaluates to `True` when `is_medical` is `False` (a perfectly valid boolean). The `ValueError` is raised, the `except` catches it, and `expand_topic()` returns the hardcoded fallback dict — ignoring the LLM's `canonical_topic`, `domain`, `arxiv_categories`, and `search_queries`.

**Impact:** Every non-medical topic (the majority of searches) falls back to `arxiv_categories=["cs.LG","cs.AI"]` and `search_queries=[topic]` — a single unrefined query against CS-only categories — even when the LLM returned a perfect expansion.

**Fix:**
```python
for key in required:
    if key not in result or (result[key] is None):
        raise ValueError(f"Missing or empty key: {key}")
# Separately handle the boolean case explicitly:
if not isinstance(result.get("is_medical"), bool):
    raise ValueError("is_medical must be a boolean")
```

---

### 2. `research_gaps` dict iterated as list in multi-paper prompt builder
**Severity:** High
**File:** [backend/app.py](../backend/app.py#L221)
**Line:** 221

```python
gaps = "; ".join(r.get("research_gaps", [])[:3])
```

**Root cause:** `analyze_text()` now returns `research_gaps` as a nested dict:
```json
{"from_limitations": [...], "from_missing_datasets": [...], ...}
```
`dict[:3]` is a `TypeError` in Python 3 (dicts are not subscriptable with slices) — **except** that `"; ".join(dict)` iterates dict *keys*, so the join silently succeeds but produces `"from_limitations; from_missing_datasets; from_missing_benchmarks"` instead of actual gap sentences.

**Impact:** The multi-paper synthesis LLM prompt receives key-name strings as the "Research Gaps" field for every paper, producing a meaningless combined analysis.

**Fix:** Use the flattened legacy key instead:
```python
gaps = "; ".join(r.get("research_gaps_flat", [])[:3])
```

---

### 3. `future_scope` dict iterated as list in multi-paper prompt builder
**Severity:** High
**File:** [backend/app.py](../backend/app.py#L225)
**Line:** 225

```python
future = "; ".join(r.get("future_scope", [])[:3])
```

**Root cause:** Same as Finding 2. `future_scope` is now `{"author_suggested": [...], "ai_generated": [...]}`. Iterating this dict yields key name strings `"author_suggested; ai_generated"`.

**Fix:**
```python
future = "; ".join(r.get("future_scope_flat", [])[:3])
```

---

### 4. `_merge_analyses()` receives dicts where flat lists are expected
**Severity:** High
**File:** [backend/app.py](../backend/app.py#L284)
**Lines:** 284–288

```python
all_gaps    = merge_lists(*[r.get("research_gaps",  []) for r in results])
all_future  = merge_lists(*[r.get("future_scope",   []) for r in results])
```

**Root cause:** When the multi-paper LLM call fails and `_merge_analyses()` is used as the fallback combiner, each `r.get("research_gaps", [])` returns a dict. `merge_lists(*[dict1, dict2, ...])` iterates each dict's keys. The resulting `all_gaps` list contains the six key-name strings (`"from_limitations"`, `"from_missing_datasets"`, etc.) — not actual research gap sentences.

The combined analysis object returned to the frontend has:
```json
"research_gaps": ["from_limitations", "from_missing_datasets", ...]
```

**Impact:** Every time the multi-paper LLM call fails (network error, rate limit, timeout), the fallback combined analysis is silently broken.

**Fix:** Use `research_gaps_flat` and `future_scope_flat` consistently:
```python
all_gaps   = merge_lists(*[r.get("research_gaps_flat", []) for r in results])
all_future = merge_lists(*[r.get("future_scope_flat",  []) for r in results])
```

---

### 5. Path traversal: unsanitized filename in `save_uploaded_file`
**Severity:** Security
**File:** [backend/storage.py](../backend/storage.py#L198)
**Line:** 198

```python
dest = os.path.join(uploads, filename)
```

**Root cause:** `filename` comes directly from `file.filename` in `app.py` — a user-controlled value. `os.path.join()` with a relative path like `../../metadata.json` resolves outside the uploads directory.

**Attack scenario:** An attacker uploads a file named `../../metadata.json`. The dest path resolves to `workspace_<id>/metadata.json`, overwriting the workspace metadata with arbitrary binary content. Depending on directory depth, a longer traversal could reach other workspaces or system files.

**Fix:**
```python
import os
safe_name = os.path.basename(filename)          # strip any directory components
if not safe_name or safe_name.startswith('.'):
    safe_name = f"upload_{uuid.uuid4().hex[:8]}.pdf"
dest = os.path.join(uploads, safe_name)
```

---

### 6. Single-PDF upload: alias mutation corrupts `papers[0]` title in response
**Severity:** Medium
**File:** [backend/app.py](../backend/app.py#L146)
**Lines:** 146–147

```python
combined = analyze_text(all_text) if len(results) > 1 else results[0]
combined['title'] = f"Combined: {len(results)} PDFs"
```

**Root cause:** When exactly one PDF is uploaded, `combined` is an alias (not a copy) of `results[0]`. The mutation on line 147 writes `"Combined: 1 PDFs"` into the same dict object that appears in `results` (returned as `papers` in the response). The frontend receives `papers[0].title = "Combined: 1 PDFs"` instead of the actual filename.

**Fix:**
```python
if len(results) > 1:
    combined = analyze_text(all_text)
else:
    combined = dict(results[0])   # shallow copy to avoid alias mutation
combined['title'] = f"Combined: {len(results)} PDF{'s' if len(results) != 1 else ''}"
```

---

### 7. `int(score)` raises `ValueError` if LLM returns score as float string
**Severity:** Low
**File:** [backend/extractors.py](../backend/extractors.py#L806)
**Line:** 806

```python
scores[idx] = max(0, min(100, int(score)))
```

**Root cause:** If Gemini returns the score field as a JSON string (`"85.5"`) rather than a number, `int("85.5")` raises `ValueError`. The outer `except Exception` at line 811 catches it and falls back to keyword scoring for all papers, silently degrading result quality.

**Note:** `int(85.5)` (Python float) works correctly; the risk is only for string-typed JSON values, which some model configurations emit.

**Fix:**
```python
scores[idx] = max(0, min(100, int(float(score))))
```

---

### 8. `kw.get("term", "")` crashes if `keywords` contains strings instead of dicts
**Severity:** Low
**File:** [backend/app.py](../backend/app.py#L293)
**Line:** 293

```python
for kw in r.get("keywords", []):
    t = kw.get("term", "").lower()
```

**Root cause:** `_merge_analyses()` assumes every item in `keywords` is a dict with a `"term"` key. If any caller passes papers where `keywords` is a list of plain strings (e.g., externally assembled paper objects passed to `/api/literature-review`), `kw.get("term", "")` raises `AttributeError: 'str' object has no attribute 'get'`, crashing the entire merge.

**Fix:**
```python
for kw in r.get("keywords", []):
    if isinstance(kw, dict):
        t = kw.get("term", "").lower()
    else:
        t = str(kw).lower()
        kw = {"term": kw, "score": 1}
```

---

### 9. `contributions` legacy key always single-item list — silently degrades display
**Severity:** Low
**File:** [backend/analyzer.py](../backend/analyzer.py#L206)
**Line:** 206

```python
result.setdefault("contributions", [result.get("main_contribution", "")])
```

**Root cause:** The old `analyze_text()` returned `contributions` as up to 5 phrase-matched sentences. The new version collapses this to a single-element list wrapping the `main_contribution` string. Any UI component or downstream code expecting multiple contribution bullets will silently show only one.

**Note:** This is a semantic regression, not a crash. The combined paper block builder at `app.py:223` calls `'; '.join(r.get("contributions", [])[:3])` — it only ever gets one sentence now.

**Recommendation:** Consider exposing `methodology.key_components` as the multi-item contributions list, or update the prompt to return `contributions` as a dedicated list field.

---

## Root Cause Summary

**Four findings (1, 2, 3, 4) share a single root cause:** the analyzer schema migration introduced nested dict shapes for `research_gaps` and `future_scope`, but the callers in `app.py` were not updated to use the new flat legacy keys (`research_gaps_flat`, `future_scope_flat`) that `analyze_text()` already provides for exactly this purpose.

The fix pattern is consistent: replace `r.get("research_gaps", [])` with `r.get("research_gaps_flat", [])` and `r.get("future_scope", [])` with `r.get("future_scope_flat", [])` in `app.py` lines 221, 225, 284, and 286.

---

## Files Affected by Findings

| File | Findings |
|------|----------|
| [backend/app.py](../backend/app.py) | #2, #3, #4, #6, #8 |
| [backend/extractors.py](../backend/extractors.py) | #1, #7 |
| [backend/storage.py](../backend/storage.py) | #5 |
| [backend/analyzer.py](../backend/analyzer.py) | #9 |

---

## Recommended Fix Order

1. **Fix #1** (`is_medical` falsy check) — affects every topic search
2. **Fix #2 + #3 + #4** together (same pattern, 4 lines) — affects multi-paper synthesis
3. **Fix #5** (path traversal) — security
4. **Fix #6** (single-PDF alias) — data corruption in response
5. **Fix #7** (int/float) — robustness
6. **Fix #8** (kw.get) — robustness
7. **Consider #9** (contributions) — semantic regression, low urgency
