"""
analyzer.py — Research analyst paper analysis pipeline (Gemini)
Transforms paper text into a structured research decomposition, not a summary.
Same function signatures — no changes needed in app.py.
"""

import re
import time
from collections import Counter
from logger import get_logger

log = get_logger(__name__)

# ── Stopwords & Text Utilities ─────────────────────────────────────────────────

STOPWORDS = set([
    "a","an","the","and","or","but","in","on","at","to","for","of","with",
    "is","are","was","were","be","been","being","have","has","had","do","does",
    "did","will","would","could","should","may","might","shall","can","this",
    "that","these","those","it","its","we","our","they","their","he","she",
    "his","her","i","my","you","your","as","by","from","into","through",
    "during","including","until","against","among","throughout","despite",
    "towards","upon","about","such","not","also","more","than","other",
    "which","who","how","what","when","where","than","there","then","so",
    "if","each","all","both","between","after","before","while","since",
    "however","therefore","thus","hence","et","al","fig","table","paper",
    "study","research","results","data","using","used","based","proposed",
    "approach","method","methods","model","models","show","shows","shown",
    "found","work","use","two","one","three","new","high","low","large",
    "small","different","same","first","second","third","respectively"
])


def clean_text(text: str) -> str:
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'[^\w\s\.\,\!\?\;\:\-]', ' ', text)
    return text.strip()


def compute_stats(text: str) -> dict:
    words = re.findall(r'\b\w+\b', text)
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if len(s.strip()) > 30]
    return {
        "word_count": len(words),
        "sentence_count": len(sentences),
        "avg_sentence_length": round(len(words) / max(len(sentences), 1), 1),
        "unique_words": len(set(w.lower() for w in words))
    }


def _fallback_keywords(text: str, top_n: int = 12) -> list:
    words = re.findall(r'\b[a-zA-Z]{4,}\b', text.lower())
    filtered = [w for w in words if w not in STOPWORDS]
    freq = Counter(filtered)
    tokens = text.lower().split()
    bigrams = [
        f"{tokens[i]} {tokens[i+1]}" for i in range(len(tokens)-1)
        if tokens[i] not in STOPWORDS and tokens[i+1] not in STOPWORDS
        and len(tokens[i]) > 3 and len(tokens[i+1]) > 3
    ]
    bigram_freq = Counter(bigrams)
    keywords = []
    seen = set()
    for bigram, count in bigram_freq.most_common(6):
        if count >= 2:
            keywords.append({"term": bigram, "score": count * 2})
            seen.update(bigram.split())
    for word, count in freq.most_common(20):
        if word not in seen and len(keywords) < top_n:
            keywords.append({"term": word, "score": count})
    return keywords[:top_n]


# ── Output Validation & Normalisation ─────────────────────────────────────────

def _validate_and_normalize(result: dict, text: str) -> dict:
    """
    Ensures every expected key exists and rejects generic placeholder content.
    Generic content is replaced with fallback extractions.
    """
    GENERIC_PHRASES = [
        "future work could explore",
        "more datasets",
        "larger models",
        "not explicitly stated",
        "no specific",
        "not available",
        "n/a",
    ]

    def is_generic(value: str) -> bool:
        v = value.lower()
        return any(p in v for p in GENERIC_PHRASES)

    def clean_list(lst: list, min_items: int = 1) -> list:
        if not isinstance(lst, list):
            return []
        cleaned = [s for s in lst if isinstance(s, str) and len(s) > 20 and not is_generic(s)]
        return cleaned if len(cleaned) >= min_items else lst  # keep originals if all filtered

    # Required scalar fields with defaults
    scalar_defaults = {
        "executive_summary":        "Summary not available.",
        "research_problem":         "Research problem not identified.",
        "motivation":               "Motivation not identified.",
        "research_gap":             "Research gap not identified.",
        "main_contribution":        "Contribution not identified.",
        "field_maturity_assessment": "",
    }
    for key, default in scalar_defaults.items():
        if key not in result or not result.get(key):
            result[key] = default

    # Methodology block
    if "methodology" not in result or not isinstance(result["methodology"], dict):
        result["methodology"] = {
            "overview": "Methodology not identified.",
            "key_components": [],
            "novelty": "Novelty not identified."
        }
    else:
        m = result["methodology"]
        m.setdefault("overview", "Methodology not identified.")
        m.setdefault("key_components", [])
        m.setdefault("novelty", "Novelty not identified.")

    # Datasets block
    if "datasets" not in result or not result["datasets"]:
        result["datasets"] = [{"name": "Not specified", "type": "unknown", "size": "unknown", "domain": "unknown"}]

    # Evaluation block
    if "evaluation" not in result or not isinstance(result["evaluation"], dict):
        result["evaluation"] = {"metrics": [], "baselines": [], "protocol": "Not specified."}
    else:
        e = result["evaluation"]
        e.setdefault("metrics", [])
        e.setdefault("baselines", [])
        e.setdefault("protocol", "Not specified.")

    # Research gaps block
    if "research_gaps" not in result or not isinstance(result["research_gaps"], dict):
        result["research_gaps"] = {
            "from_limitations": [],
            "from_missing_datasets": [],
            "from_missing_benchmarks": [],
            "from_generalization": [],
            "from_deployment": [],
            "from_unsolved_problems": []
        }
    else:
        gap_keys = ["from_limitations", "from_missing_datasets", "from_missing_benchmarks",
                    "from_generalization", "from_deployment", "from_unsolved_problems"]
        for k in gap_keys:
            result["research_gaps"].setdefault(k, [])

    # Future scope block
    if "future_scope" not in result or not isinstance(result["future_scope"], dict):
        result["future_scope"] = {"author_suggested": [], "ai_generated": []}
    else:
        result["future_scope"].setdefault("author_suggested", [])
        result["future_scope"].setdefault("ai_generated", [])

    # Simple list fields — never fill with placeholder strings; prefer empty list over noise.
    # Keywords get a real fallback; everything else stays empty if the LLM returns nothing.
    list_fields = {
        "results_and_findings": 1,
        "strengths":            1,
        "weaknesses":           1,
        "limitations":          1,
        "key_takeaways":        1,
        "keywords":             3,
    }
    for field, min_items in list_fields.items():
        if field not in result or not result[field]:
            if field == "keywords":
                result[field] = _fallback_keywords(text)
            else:
                result[field] = []   # empty is cleaner than placeholder text
        elif field not in ("keywords",):
            cleaned = clean_list(result[field], min_items)
            result[field] = cleaned if cleaned else result[field]

    return result


# ── Main Analysis Entry Point ──────────────────────────────────────────────────

def analyze_text(text: str) -> dict:
    """
    Single-call UNDERSTAND + REASON + OUTPUT pipeline.
    One LLM call builds understanding and generates analysis together,
    halving API usage vs the previous two-stage approach while preserving quality.
    Falls back to regex extraction only if the LLM call fails.
    """
    text = clean_text(text)
    if len(text) < 50:
        log.warning(f"analyze_text: text too short ({len(text)} chars)")
        return {"error": "Text too short for analysis"}

    stats = compute_stats(text)
    log.debug(f"analyze_text: {stats['word_count']} words, {stats['sentence_count']} sentences")

    try:
        from llm import call_llm, paper_combined_prompt

        log.info("analyze_text: combined understand+analyse call")
        t0 = time.perf_counter()
        result = call_llm(paper_combined_prompt(text), expect_json=True)
        log.info(f"analyze_text: done in {(time.perf_counter()-t0)*1000:.0f}ms")

        # Extract understanding sub-object (embedded by combined prompt)
        understanding = result.get("_understanding", {})

        # ── Pre-normalize: convert Stage 2 structured types before validation ─
        result = _pre_normalize_stage2(result)

        # ── Validate & fill any missing keys ──────────────────────────────────
        result = _validate_and_normalize(result, text)
        result["stats"] = stats

        # ── Flatten for UI legacy keys ─────────────────────────────────────────
        result["research_gaps_flat"] = _flatten_research_gaps(result["research_gaps"])
        result["future_scope_flat"]  = (
            result["future_scope"].get("author_suggested", []) +
            result["future_scope"].get("ai_generated", [])
        )

        # Legacy keys expected by existing UI components
        result.setdefault("summary",            result.get("executive_summary", ""))
        result.setdefault("important_sentences", result.get("key_takeaways", []))
        result.setdefault("contributions",       [result.get("main_contribution", "")] if result.get("main_contribution") else [])
        meth = result.get("methodology", {})
        result.setdefault("methods", meth.get("key_components", [meth.get("overview", "")]) if isinstance(meth, dict) else [])
        result.setdefault("evaluation_metrics", result.get("evaluation", {}).get("metrics", []) if isinstance(result.get("evaluation"), dict) else [])

        return result

    except Exception as e:
        log.warning(f"analyze_text: two-stage LLM pipeline failed ({e}), using regex fallback", exc_info=True)
        return _fallback_analyze(text, stats)


def _pre_normalize_stage2(result: dict) -> dict:
    """
    Convert Stage 2 structured types to formats _validate_and_normalize expects.

    Stage 2 returns limitations as a dict-of-lists (6 categories). The validation
    layer and UI expect limitations as a flat list. We flatten it and keep the
    structured version under _limitations_structured for multi-paper synthesis.
    """
    # Flatten limitations dict → flat list; preserve structured version
    lim_raw = result.get("limitations", {})
    if isinstance(lim_raw, dict):
        flat_lims = []
        for category_items in lim_raw.values():
            if isinstance(category_items, list):
                flat_lims.extend(category_items)
        result["_limitations_structured"] = lim_raw  # keep for synthesis
        result["limitations"] = flat_lims

    # Ensure research_gaps is a dict with expected sub-keys
    gaps = result.get("research_gaps", {})
    if not isinstance(gaps, dict):
        result["research_gaps"] = {}
    for k in ("from_limitations", "from_missing_datasets", "from_missing_benchmarks",
              "from_generalization", "from_deployment", "from_unsolved_problems"):
        result["research_gaps"].setdefault(k, [])

    # Ensure future_scope is a dict with expected sub-keys
    fs = result.get("future_scope", {})
    if not isinstance(fs, dict):
        result["future_scope"] = {"author_suggested": [], "ai_generated": []}
    else:
        fs.setdefault("author_suggested", [])
        fs.setdefault("ai_generated", [])

    return result


def _flatten_research_gaps(gaps_dict: dict) -> list:
    """Flatten the structured research_gaps dict into a flat list for legacy consumers."""
    flat = []
    for key, items in gaps_dict.items():
        if isinstance(items, list):
            flat.extend(items)
    return flat


# ── Fallback (Regex-Based) ─────────────────────────────────────────────────────

def _fallback_analyze(text: str, stats: dict) -> dict:
    """
    Used only when the LLM call fails completely. Extracts what it can via
    sentence-level pattern matching. Returns empty lists for fields it cannot
    reliably extract — never emits placeholder strings like 'No explicit X detected.'
    """
    def sentence_split(t):
        return [s.strip() for s in re.split(r'(?<=[.!?])\s+', t) if len(s.strip()) > 40]

    def match_phrases(t, phrases, max_r=4):
        """Return sentences containing any of the phrases; empty list if none found."""
        sents = sentence_split(t)
        matched = []
        for sent in sents:
            sl = sent.lower()
            if any(p in sl for p in phrases):
                matched.append(sent.strip())
                if len(matched) >= max_r:
                    break
        return matched  # empty list is correct — caller must not produce placeholder text

    keywords  = _fallback_keywords(text)
    sentences = sentence_split(text)
    tl        = text.lower()

    # Summary: first meaningful sentences (already good content)
    summary_sents = sentences[:3]
    summary = " ".join(summary_sents) if summary_sents else ""

    # Contribution: sentences with proposal language
    contributions = match_phrases(text, [
        "we propose", "we present", "we introduce", "we develop",
        "we design", "our approach", "our method", "our framework",
        "this paper proposes", "this paper presents", "this work",
    ])

    # Methods: keyword detection
    methods = _extract_methods(text)

    # Results: sentences with performance claims
    results = match_phrases(text, [
        "results show", "we achieve", "outperform", "demonstrates",
        "accuracy of", "improves", "reduces", "state-of-the-art",
        "% on", "surpasses", "better than",
    ])

    # Strengths: performance or novelty claims
    strengths = match_phrases(text, [
        "novel", "outperform", "state-of-the-art", "superior",
        "significantly", "efficient", "scalable", "robust",
    ])

    # Limitations: explicit scope restriction language
    limitations = match_phrases(text, [
        "limited to", "does not", "cannot", "unable to",
        "limitation", "drawback", "only applicable", "restricted to",
        "assumption", "we do not address",
    ])

    # Research gaps: language that highlights missing work
    gap_from_limits   = match_phrases(text, ["limited to", "only", "does not handle", "restricted"])
    gap_from_generali = match_phrases(text, ["generali", "domain adaptation", "transfer", "out-of-distribution"])
    gap_from_deploy   = match_phrases(text, ["real-world", "deployment", "practical", "scalab", "latency"])
    gap_from_unsolved = match_phrases(text, [
        "gap in", "lack of", "underexplored", "not yet", "remains open",
        "challenge", "open problem", "however", "existing methods",
    ])

    research_gaps = {
        "from_limitations":       gap_from_limits,
        "from_missing_datasets":  match_phrases(text, ["dataset", "benchmark", "corpus", "evaluation set"]),
        "from_missing_benchmarks": [],
        "from_generalization":    gap_from_generali,
        "from_deployment":        gap_from_deploy,
        "from_unsolved_problems": gap_from_unsolved,
    }

    future_author = match_phrases(text, [
        "future work", "future research", "can be extended", "will be explored",
        "we plan", "next step", "in the future",
    ])
    future_ai = match_phrases(text, [
        "further investigation", "promising direction", "could be improved",
        "worth exploring", "potential direction",
    ])

    # Key takeaways: first few sentences of summary
    key_takeaways = sentences[:3]

    return {
        "executive_summary":     summary,
        "research_problem":      sentences[0] if sentences else "",
        "motivation":            sentences[1] if len(sentences) > 1 else "",
        "research_gap":          gap_from_unsolved[0] if gap_from_unsolved else "",
        "main_contribution":     contributions[0] if contributions else "",
        "methodology": {
            "overview":       ", ".join(methods) if methods else "",
            "key_components": methods,
            "novelty":        ""
        },
        "datasets":           [{"name": "Not specified", "type": "unknown", "size": "unknown", "domain": "unknown"}],
        "evaluation": {
            "metrics":    [],
            "baselines":  [],
            "protocol":   ""
        },
        "results_and_findings": results,
        "strengths":            strengths,
        "weaknesses":           limitations,
        "limitations":          limitations,
        "research_gaps":        research_gaps,
        "research_gaps_flat":   _flatten_research_gaps(research_gaps),
        "future_scope": {
            "author_suggested": future_author,
            "ai_generated":     future_ai,
        },
        "future_scope_flat":    future_author + future_ai,
        "key_takeaways":        key_takeaways,
        "keywords":             keywords,

        # Legacy back-compat keys
        "summary":              summary,
        "important_sentences":  sentences[:5],
        "research_gaps_legacy": gap_from_unsolved,
        "contributions":        contributions,
        "methods":              methods,
        "evaluation_metrics":   [],

        "stats": stats,
    }


def _extract_methods(text: str) -> list:
    METHOD_KEYWORDS = [
        "neural network", "deep learning", "machine learning", "transformer",
        "bert", "gpt", "lstm", "cnn", "rnn", "attention mechanism",
        "reinforcement learning", "supervised", "unsupervised",
        "random forest", "svm", "regression", "classification",
        "clustering", "embedding", "fine-tuning", "transfer learning",
        "generative", "bayesian", "statistical"
    ]
    found = []
    tl = text.lower()
    for method in METHOD_KEYWORDS:
        if method in tl:
            found.append(method.title())
    return list(dict.fromkeys(found))[:10]
