"""
literature_review.py — Research analyst literature review generator (Gemini)
Produces a full academic review with synthesis, not sequential paper summaries.
Same generate_literature_review() signature — no changes needed in app.py.
"""

import re
import json
from collections import Counter


def generate_literature_review(papers: list, topic: str = "") -> dict:
    """
    Generate a complete structured literature review using Gemini LLM.
    Falls back to regex-based generation if LLM is unavailable.

    Args:
        papers: list of paper dicts with title, abstract, authors, published, url,
                and optionally 'analysis' (pre-computed from analyzer.py)
        topic:  the research topic string

    Returns:
        dict with all sections of the literature review
    """
    if not papers:
        return {"error": "No papers provided"}

    topic_label  = topic or "the selected research area"
    n            = len(papers)
    summary_table = _build_summary_table(papers)

    try:
        from llm import call_llm, literature_review_prompt

        # Build rich paper data: use pre-computed analyses where available
        papers_data = []
        for p in papers:
            analysis = p.get("analysis", {})
            entry = {
                "title":            p.get("title", "Unknown"),
                "authors":          p.get("authors", [])[:3],
                "published":        p.get("published", "")[:4],
                "abstract":         p.get("abstract", "")[:500],
                "url":              p.get("url", ""),
                # Enrich with structured analysis if available
                "research_problem": analysis.get("research_problem", ""),
                "main_contribution":analysis.get("main_contribution", ""),
                "methodology":      analysis.get("methodology", {}).get("overview", "")
                                    if isinstance(analysis.get("methodology"), dict)
                                    else str(analysis.get("methods", "")),
                "datasets":         [
                                        d.get("name", d) if isinstance(d, dict) else d
                                        for d in (analysis.get("datasets") or [])
                                    ][:3],
                "key_results":      analysis.get("results_and_findings", [])[:2],
                "limitations":      analysis.get("limitations", [])[:2],
                "research_gaps":    analysis.get("research_gaps_flat", [])[:2],
            }
            papers_data.append(entry)

        papers_json = json.dumps(papers_data, indent=2)
        result = call_llm(literature_review_prompt(papers_json, topic_label), expect_json=True)

        # Inject URLs into LLM summary table
        llm_table = result.get("summary_table", [])
        for i, row in enumerate(llm_table):
            if i < len(papers) and not row.get("url"):
                row["url"] = papers[i].get("url", "")

        # Ensure all sections have content; fall back to local generation per section
        intro    = result.get("introduction")    or _fallback_intro(topic_label, n, papers)
        bg       = result.get("background")      or _fallback_background(topic_label, papers)
        thematic = result.get("thematic_analysis") or _fallback_thematic(topic_label, n)
        method_c = result.get("methodology_comparison") or ""
        dataset_c= result.get("dataset_comparison") or ""
        trends   = result.get("research_trends") or ""
        conc     = result.get("conclusion_and_gaps") or _fallback_conclusion(topic_label, papers)
        conclusion = result.get("conclusion")    or ""

        return {
            "topic":                    topic_label,
            "paper_count":              n,
            "introduction":             intro,
            "background":               bg,
            "thematic_analysis":        thematic,
            "methodology_comparison":   method_c,
            "dataset_comparison":       dataset_c,
            "research_trends":          trends,
            "conclusion_and_gaps":      conc,
            "conclusion":               conclusion,
            "summary_table":            llm_table if llm_table else summary_table,
            "themes":                   result.get("themes", []),
            "trajectory_notes":         [],
            "common_gaps":              result.get("common_gaps", [])[:6],
            "common_limitations":       result.get("common_limitations", [])[:5],
            "future_suggestions":       result.get("future_suggestions", [])[:6],
        }

    except Exception as e:
        print(f"LLM literature review failed, using fallback: {e}")
        return _fallback_literature_review(papers, topic_label, summary_table, n)


# ── Summary Table Builder ──────────────────────────────────────────────────────

def _build_summary_table(papers: list) -> list:
    """
    Build the summary table. Uses pre-computed analysis if available;
    falls back to abstract pattern matching.
    """
    rows = []
    for p in papers:
        authors   = p.get("authors", [])
        author_str = authors[0].split()[-1] if authors else "Unknown"
        year      = p.get("published", "")[:4] or "N/A"
        label     = f"{author_str} et al. ({year})" if len(authors) > 1 else f"{author_str} ({year})"

        abstract  = p.get("abstract", "")
        sentences = re.split(r'(?<=[.!?])\s+', abstract)
        analysis  = p.get("analysis", {})

        # Prefer structured analysis fields
        research_problem = (
            analysis.get("research_problem")
            or _first_sentence_containing(sentences, ["problem", "challenge", "task", "issue"])
            or (sentences[0].strip() if sentences else "N/A")
        )

        contribution = (
            analysis.get("main_contribution")
            or _first_sentence_containing(sentences, ["propose", "present", "introduce", "develop", "novel"])
            or (sentences[1].strip() if len(sentences) > 1 else "N/A")
        )

        methodology = "Not explicitly stated"
        if isinstance(analysis.get("methodology"), dict):
            methodology = analysis["methodology"].get("overview", "Not explicitly stated")
        elif analysis.get("methods"):
            methodology = ", ".join(analysis["methods"][:3])
        else:
            methodology = _first_sentence_containing(
                sentences, ["using", "based on", "via", "employ", "utilize", "framework"]
            ) or "Not explicitly stated"

        # Datasets
        datasets_raw = analysis.get("datasets", [])
        if datasets_raw and isinstance(datasets_raw[0], dict):
            dataset_str = ", ".join(d.get("name", "") for d in datasets_raw[:3])
        elif datasets_raw:
            dataset_str = ", ".join(str(d) for d in datasets_raw[:3])
        else:
            dataset_str = "Not specified"

        # Results
        results_list = analysis.get("results_and_findings", [])
        key_results = results_list[0] if results_list else (
            _first_sentence_containing(sentences, ["results show", "achieve", "outperform", "demonstrate"])
            or (sentences[-1].strip() if sentences else "N/A")
        )

        # Limitations
        limits_list = analysis.get("limitations", [])
        limitation = limits_list[0] if limits_list else (
            _first_sentence_containing(sentences, ["limitation", "drawback", "cannot", "restricted"])
            or "Not stated in abstract"
        )

        rows.append({
            "title":            p.get("title", "Unknown"),
            "authors":          label,
            "research_problem": str(research_problem)[:250],
            "contribution":     str(contribution)[:250],
            "methodology":      str(methodology)[:200],
            "datasets":         dataset_str[:150],
            "key_results":      str(key_results)[:200],
            "limitations":      str(limitation)[:200],
            "url":              p.get("url", ""),
        })
    return rows


def _first_sentence_containing(sentences: list, keywords: list) -> str:
    for sent in sentences:
        sl = sent.lower()
        if any(kw in sl for kw in keywords):
            return sent.strip()[:250]
    return ""


# ── Fallback Section Generators ───────────────────────────────────────────────

def _fallback_intro(topic: str, n: int, papers: list) -> str:
    years = [int(p.get("published", "")[:4]) for p in papers
             if p.get("published", "")[:4].isdigit()]
    yr = f"{min(years)}–{max(years)}" if len(years) >= 2 else str(years[0]) if years else "recent years"
    return (
        f"<h2>1. Introduction</h2>"
        f"<p>This literature review synthesizes findings from <strong>{n} papers</strong> "
        f"in the field of <strong>{topic}</strong>, covering research published between {yr}.</p>"
        f"<p>The review identifies dominant methodologies, key contributions, recurring research gaps, "
        f"and future directions, providing a comprehensive overview of the current state of the field.</p>"
        f"<p>The papers reviewed represent a cross-section of recent progress in {topic}, "
        f"encompassing both methodological innovations and empirical evaluations.</p>"
    )


def _fallback_background(topic: str, papers: list) -> str:
    return (
        f"<h2>2. Background</h2>"
        f"<p>{topic} has attracted significant research attention due to its theoretical importance "
        f"and practical applications. Prior work in this area has established foundational methods "
        f"and benchmarks that the papers reviewed here build upon.</p>"
        f"<p>The evolution of approaches in this domain reflects broader trends in the field, "
        f"with increasing emphasis on data-driven methods, scalability, and real-world applicability.</p>"
    )


def _fallback_thematic(topic: str, n: int) -> str:
    return (
        f"<h2>3. Thematic Analysis</h2>"
        f"<h3>3.1 Methodological Approaches</h3>"
        f"<p>Across the {n} reviewed papers, several methodological families emerge as dominant in {topic}. "
        f"Papers vary in their architectural choices, training strategies, and evaluation protocols, "
        f"reflecting the field's ongoing exploration of effective approaches.</p>"
        f"<h3>3.2 Empirical Evaluation</h3>"
        f"<p>Evaluation practices differ across papers, with variation in benchmark datasets, "
        f"metrics, and baseline comparisons. This inconsistency limits direct comparison of results "
        f"and points to a need for standardized evaluation protocols in {topic}.</p>"
    )


def _fallback_conclusion(topic: str, papers: list) -> str:
    all_gaps, all_limits, all_future = [], [], []
    gap_phrases    = ["gap in", "lack of", "underexplored", "limited research", "not yet", "open problem"]
    limit_phrases  = ["limitation", "limited by", "drawback", "constraint", "weakness", "unable", "cannot"]
    future_phrases = ["future work", "future research", "can be extended", "further investigation"]

    def find_sentences(text, phrases):
        sents = re.split(r'(?<=[.!?])\s+', text)
        found = []
        for sent in sents:
            sl = sent.lower()
            for ph in phrases:
                if ph in sl and len(sent) > 30:
                    found.append(sent.strip())
                    break
        return found[:3]

    for p in papers:
        text = p.get("abstract", "")
        all_gaps.extend(find_sentences(text, gap_phrases))
        all_limits.extend(find_sentences(text, limit_phrases))
        all_future.extend(find_sentences(text, future_phrases))

    gap_items  = "".join(f"<li>{g}</li>" for g in list(dict.fromkeys(all_gaps))[:5]) \
                 or "<li>Research gaps not explicitly stated in available abstracts.</li>"
    lim_items  = "".join(f"<li>{l}</li>" for l in list(dict.fromkeys(all_limits))[:4]) \
                 or "<li>Limitations not explicitly stated in available abstracts.</li>"
    fut_items  = "".join(f"<li>{f}</li>" for f in list(dict.fromkeys(all_future))[:4]) \
                 or "<li>Future directions not explicitly stated in available abstracts.</li>"

    return (
        f"<h2>7. Research Gaps, Limitations &amp; Future Directions</h2>"
        f"<h3>7.1 Research Gaps</h3><ul>{gap_items}</ul>"
        f"<h3>7.2 Common Limitations</h3><ul>{lim_items}</ul>"
        f"<h3>7.3 Future Research Directions</h3><ul>{fut_items}</ul>"
        f"<p>Substantial opportunities remain for future investigation in {topic}.</p>"
    )


# ── Full Fallback ──────────────────────────────────────────────────────────────

def _fallback_literature_review(papers, topic, summary_table, n):
    all_gaps, all_limits, all_future = [], [], []
    gap_phrases    = ["gap in", "lack of", "underexplored", "limited research", "not yet", "open problem"]
    limit_phrases  = ["limitation", "limited by", "drawback", "constraint", "weakness", "unable", "cannot"]
    future_phrases = ["future work", "future research", "can be extended", "further investigation", "next step"]

    def find_sentences(text, phrases):
        sents = re.split(r'(?<=[.!?])\s+', text)
        found = []
        for sent in sents:
            sl = sent.lower()
            for ph in phrases:
                if ph in sl and len(sent) > 30:
                    found.append(sent.strip())
                    break
        return found[:3]

    for p in papers:
        text = p.get("abstract", "")
        all_gaps.extend(find_sentences(text, gap_phrases))
        all_limits.extend(find_sentences(text, limit_phrases))
        all_future.extend(find_sentences(text, future_phrases))

    return {
        "topic":                    topic,
        "paper_count":              n,
        "introduction":             _fallback_intro(topic, n, papers),
        "background":               _fallback_background(topic, papers),
        "thematic_analysis":        _fallback_thematic(topic, n),
        "methodology_comparison":   "",
        "dataset_comparison":       "",
        "research_trends":          "",
        "conclusion_and_gaps":      _fallback_conclusion(topic, papers),
        "conclusion":               "",
        "summary_table":            summary_table,
        "themes":                   [],
        "trajectory_notes":         [],
        "common_gaps":              list(dict.fromkeys(all_gaps))[:5],
        "common_limitations":       list(dict.fromkeys(all_limits))[:5],
        "future_suggestions":       list(dict.fromkeys(all_future))[:5],
    }
