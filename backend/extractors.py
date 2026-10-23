"""
extractors.py — Multi-source paper retrieval with topic intelligence and relevance ranking.

Pipeline:
  1. call_llm(topic_expansion_prompt)  → canonical topic, domain, 4-5 queries, relevance concepts
  2. search all sources in parallel    → arXiv, Semantic Scholar, OpenAlex, PubMed (if medical)
  3. merge + deduplicate               → by title similarity and DOI/arXiv ID
  4. score relevance                   → LLM batch scores each paper 0-100
  5. rank + filter                     → drop score < 20, sort by composite score
  6. return top N                      → with full metadata: title, authors, year, source,
                                          citation count, abstract, url, relevance_score
"""

import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
import re
import io
import ssl
import json
import math
import time
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from logger import get_logger

log = get_logger(__name__)

SSL_CTX = ssl.create_default_context()

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

JSON_HEADERS = {**HEADERS, "Accept": "application/json"}

# Minimum composite score to include a paper in results
RELEVANCE_THRESHOLD = 20
# Hard floor on LLM semantic score alone — prevents high-citation off-topic papers
# from passing via citation/recency boost. Papers below this are rejected regardless
# of composite score.
MIN_SEMANTIC_SCORE = 40

# Current year for recency scoring
CURRENT_YEAR = datetime.now().year


# ── Topic Intelligence ────────────────────────────────────────────────────────

def expand_topic(topic: str) -> dict:
    """
    Use Gemini to understand and expand the research topic into:
      - canonical_topic, domain, is_medical, arxiv_categories,
        search_queries, relevance_concepts, rejection_signals

    Falls back to a safe default dict if LLM call fails.
    """
    try:
        from llm import call_llm, topic_expansion_prompt
        result = call_llm(topic_expansion_prompt(topic), expect_json=True)
        # Validate required keys exist and are non-empty
        required = [
            "canonical_topic", "domain", "is_medical",
            "arxiv_categories", "search_queries",
            "relevance_concepts", "rejection_signals",
        ]
        for key in required:
            if key not in result or not result[key]:
                raise ValueError(f"Missing or empty key: {key}")
        log.info(f"topic_expand: canonical='{result['canonical_topic']}' "
                 f"domain={result['domain']} is_medical={result['is_medical']}")
        log.debug(f"topic_expand: queries={result['search_queries']}")
        return result
    except Exception as e:
        log.warning(f"topic_expand: LLM expansion failed ({e}), using defaults")
        return {
            "canonical_topic": topic,
            "domain": "other",
            "is_medical": _is_medical_fallback(topic),
            "arxiv_categories": ["cs.LG", "cs.AI"],
            "search_queries": [topic],
            "relevance_concepts": [topic],
            "rejection_signals": [],
        }


def _is_medical_fallback(topic: str) -> bool:
    """Lightweight fallback medical detector used only when LLM expansion fails."""
    MEDICAL_KEYWORDS = {
        "disease", "clinical", "medical", "patient", "diagnosis", "diagnostic",
        "retinal", "diabetic", "cancer", "tumor", "cardiac", "brain", "neural",
        "drug", "therapy", "treatment", "hospital", "mri", "ct scan", "pathology",
        "radiology", "ophthalmology", "oncology", "cardiology", "dermatology",
        "fundus", "lesion", "segmentation", "biomarker", "genomic", "protein",
    }
    tl = topic.lower()
    return any(kw in tl for kw in MEDICAL_KEYWORDS)


# ── Main Entry Point ──────────────────────────────────────────────────────────

def search_papers(topic: str, max_results: int = 10) -> list:
    """
    Full pipeline: topic understanding → multi-source search →
    merge → deduplicate → relevance score → rank → return top N.

    Replaces the old search_arxiv() function.
    Also aliased as search_arxiv() for backward compatibility with app.py.
    """
    log.info(f"search_papers: START topic='{topic}' max_results={max_results}")

    # ── Step 1: Understand the topic ──────────────────────────────
    topic_info = expand_topic(topic)
    queries          = topic_info["search_queries"]
    categories       = topic_info["arxiv_categories"]
    is_medical       = topic_info["is_medical"]
    canonical_topic  = topic_info["canonical_topic"]
    relevance_concepts = topic_info["relevance_concepts"]
    rejection_signals  = topic_info["rejection_signals"]

    # Fetch significantly more than needed so ranking can select the best
    fetch_per_source = max(max_results * 3, 20)

    # ── Step 2: Search all sources concurrently ────────────────────
    all_papers = []

    def run_arxiv():
        results = []
        for q in queries[:3]:          # top 3 queries for arXiv
            results += _search_arxiv_api(q, fetch_per_source // 3, categories)
        return results

    def run_semantic_scholar():
        results = []
        for q in queries[:4]:          # top 4 queries for S2
            results += _search_semantic_scholar(q, fetch_per_source // 4)
        return results

    def run_openalex():
        results = []
        for q in queries[:3]:
            results += _search_openalex(q, fetch_per_source // 3)
        return results

    def run_pubmed():
        if not is_medical:
            return []
        # Combine up to 3 queries with OR so we make one esearch + one efetch
        # instead of 3 × (esearch + sleep + efetch), releasing the executor
        # thread 3× faster and using only 2 NCBI requests.
        combined_query = " OR ".join(f'("{q}")' for q in queries[:3])
        return _search_pubmed(combined_query, fetch_per_source)

    sources = {
        "arXiv":            run_arxiv,
        "Semantic Scholar": run_semantic_scholar,
        "OpenAlex":         run_openalex,
        "PubMed":           run_pubmed,
    }

    source_counts = {}
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(fn): name for name, fn in sources.items()}
        for future in as_completed(futures):
            name = futures[future]
            try:
                papers = future.result()
                source_counts[name] = len(papers)
                all_papers.extend(papers)
                log.debug(f"search_papers: [{name}] returned {len(papers)} papers")
                print(f"  [{name}] returned {len(papers)} raw papers")
            except Exception as e:
                log.error(f"search_papers: [{name}] failed: {e}", exc_info=True)
                source_counts[name] = 0

    log.info(f"search_papers: raw total={len(all_papers)} "
             f"({', '.join(f'{k}:{v}' for k, v in source_counts.items())})")

    if not all_papers:
        log.warning("search_papers: no papers from any source — returning mock results")
        return _mock_papers(topic, max_results)

    # ── Step 3: Deduplicate ────────────────────────────────────────
    unique_papers = _deduplicate(all_papers)
    log.info(f"search_papers: after dedup={len(unique_papers)}")

    # ── Step 4: Score relevance ────────────────────────────────────
    scored_papers = _score_and_rank(
        unique_papers,
        relevance_concepts,
        rejection_signals,
        canonical_topic,
    )
    log.info(f"search_papers: after relevance filter (threshold={RELEVANCE_THRESHOLD})={len(scored_papers)}")

    # ── Step 5: Return top N ───────────────────────────────────────
    final = scored_papers[:max_results]
    log.info(f"search_papers: returning top {len(final)} papers")
    for i, p in enumerate(final, 1):
        log.debug(f"  #{i} [{p.get('relevance_score', '?'):>3}] {p['title'][:70]}")
    return final


# Backward-compatible alias so app.py needs no changes
def search_arxiv(topic: str, max_results: int = 10) -> list:
    return search_papers(topic, max_results)


# ── Source: arXiv ─────────────────────────────────────────────────────────────

def _search_arxiv_api(query: str, max_results: int, categories: list = None) -> list:
    """
    Search arXiv across given category list (e.g. ['cs.CV', 'eess.IV']).
    Falls back to cs.* if no categories given.
    """
    try:
        encoded = urllib.parse.quote(query)

        # Build category filter
        if categories:
            cat_filter = "+OR+".join(f"cat:{c}" for c in categories)
            cat_clause = f"+AND+({cat_filter})"
        else:
            cat_clause = "+AND+cat:cs.*"

        url = (
            f"https://export.arxiv.org/api/query?"
            f"search_query=(ti:{encoded}+OR+abs:{encoded}){cat_clause}"
            f"&start=0&max_results={max_results * 2}"
            f"&sortBy=relevance&sortOrder=descending"
        )

        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=20, context=SSL_CTX) as resp:
            xml_data = resp.read()

        ns    = {"atom": "http://www.w3.org/2005/Atom"}
        root  = ET.fromstring(xml_data)
        papers = []

        for entry in root.findall("atom:entry", ns):
            title_el     = entry.find("atom:title", ns)
            summary_el   = entry.find("atom:summary", ns)
            published_el = entry.find("atom:published", ns)
            id_el        = entry.find("atom:id", ns)

            if title_el is None or summary_el is None:
                continue

            title    = title_el.text.strip().replace("\n", " ")
            abstract = summary_el.text.strip().replace("\n", " ")
            if len(abstract) < 50:
                continue

            authors = [
                a.find("atom:name", ns).text
                for a in entry.findall("atom:author", ns)
                if a.find("atom:name", ns) is not None
            ]

            arxiv_id = ""
            raw_id   = id_el.text if id_el is not None else ""
            m = re.search(r"arxiv\.org/abs/(.+)$", raw_id)
            if m:
                arxiv_id = m.group(1)

            year = ""
            if published_el is not None:
                year = published_el.text[:4]

            papers.append({
                "title":       title,
                "abstract":    abstract,
                "authors":     authors[:6],
                "year":        year,
                "published":   published_el.text[:10] if published_el is not None else "",
                "url":         raw_id,
                "citations":   0,
                "source":      "arXiv",
                "venue":       "arXiv",
                "_arxiv_id":   arxiv_id,
                "_doi":        "",
            })

            if len(papers) >= max_results:
                break

        return papers

    except Exception as e:
        print(f"    [arXiv] error for query '{query[:50]}': {e}")
        return []


# ── Source: Semantic Scholar ──────────────────────────────────────────────────

def _search_semantic_scholar(query: str, max_results: int) -> list:
    """
    Search Semantic Scholar. Returns papers with citation counts and open-access URLs.
    No field filter applied — topic routing is now handled via query expansion.
    """
    try:
        encoded = urllib.parse.quote(query)
        fetch   = max(max_results * 2, 15)

        url = (
            f"https://api.semanticscholar.org/graph/v1/paper/search"
            f"?query={encoded}"
            f"&limit={fetch}"
            f"&fields=title,abstract,authors,year,externalIds,"
            f"citationCount,venue,openAccessPdf,fieldsOfStudy"
        )

        req = urllib.request.Request(url, headers=JSON_HEADERS)
        with urllib.request.urlopen(req, timeout=25, context=SSL_CTX) as resp:
            data = json.loads(resp.read())

        raw    = data.get("data", [])
        papers = []

        for p in raw:
            abstract = (p.get("abstract") or "").strip().replace("\n", " ")
            title    = (p.get("title")    or "").strip().replace("\n", " ")
            if len(abstract) < 50 or not title:
                continue

            authors  = [a.get("name", "") for a in p.get("authors", [])[:6]]
            ext_ids  = p.get("externalIds") or {}
            open_pdf = (p.get("openAccessPdf") or {}).get("url", "")
            arxiv_id = ext_ids.get("ArXiv", "")
            doi      = ext_ids.get("DOI", "")
            pmid     = ext_ids.get("PubMed", "")

            if open_pdf:
                link = open_pdf
            elif arxiv_id:
                link = f"https://arxiv.org/abs/{arxiv_id}"
            elif doi:
                link = f"https://doi.org/{doi}"
            elif pmid:
                link = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
            else:
                link = ""

            year = str(p.get("year", "")) if p.get("year") else ""

            papers.append({
                "title":     title,
                "abstract":  abstract,
                "authors":   authors,
                "year":      year,
                "published": year,
                "url":       link,
                "citations": p.get("citationCount", 0) or 0,
                "source":    "Semantic Scholar",
                "venue":     p.get("venue", "") or "",
                "_arxiv_id": arxiv_id,
                "_doi":      doi,
            })

            if len(papers) >= max_results:
                break

        return papers

    except Exception as e:
        print(f"    [Semantic Scholar] error for query '{query[:50]}': {e}")
        return []


# ── Source: OpenAlex ──────────────────────────────────────────────────────────

def _search_openalex(query: str, max_results: int) -> list:
    """
    Search OpenAlex — broad academic corpus, strong cross-disciplinary coverage.
    Free API, no key required. Returns DOI, citation count, year, open-access URL.
    """
    try:
        encoded = urllib.parse.quote(query)
        fetch   = max(max_results * 2, 15)

        url = (
            f"https://api.openalex.org/works"
            f"?search={encoded}"
            f"&per-page={fetch}"
            f"&select=title,abstract_inverted_index,authorships,publication_year,"
            f"doi,cited_by_count,primary_location,open_access,ids"
            f"&sort=relevance_score:desc"
            f"&mailto=research@example.com"   # polite pool for better rate limits
        )

        req = urllib.request.Request(url, headers=JSON_HEADERS)
        with urllib.request.urlopen(req, timeout=25, context=SSL_CTX) as resp:
            data = json.loads(resp.read())

        results = data.get("results", [])
        papers  = []

        for p in results:
            title = (p.get("title") or "").strip()
            if not title:
                continue

            # OpenAlex stores abstracts as inverted index — reconstruct plain text
            abstract = _reconstruct_abstract(p.get("abstract_inverted_index"))
            if len(abstract) < 50:
                continue

            # Authors
            authors = []
            for auth in (p.get("authorships") or [])[:6]:
                name = (auth.get("author") or {}).get("display_name", "")
                if name:
                    authors.append(name)

            year = str(p.get("publication_year", "")) if p.get("publication_year") else ""

            # DOI
            doi = (p.get("doi") or "").replace("https://doi.org/", "")

            # Best URL: prefer open access, then DOI
            oa_url = (p.get("open_access") or {}).get("oa_url", "")
            doi_url = f"https://doi.org/{doi}" if doi else ""
            link    = oa_url or doi_url or ""

            # Citation count
            citations = p.get("cited_by_count", 0) or 0

            # Venue
            venue = ""
            primary_loc = p.get("primary_location") or {}
            source = primary_loc.get("source") or {}
            if source:
                venue = source.get("display_name", "")

            papers.append({
                "title":     title,
                "abstract":  abstract,
                "authors":   authors,
                "year":      year,
                "published": year,
                "url":       link,
                "citations": citations,
                "source":    "OpenAlex",
                "venue":     venue,
                "_arxiv_id": "",
                "_doi":      doi,
            })

            if len(papers) >= max_results:
                break

        return papers

    except Exception as e:
        print(f"    [OpenAlex] error for query '{query[:50]}': {e}")
        return []


def _reconstruct_abstract(inverted_index: dict) -> str:
    """
    OpenAlex stores abstracts as {word: [position, ...]} dicts.
    Reconstruct to plain text by sorting words by their first position.
    """
    if not inverted_index:
        return ""
    try:
        positions = {}
        for word, pos_list in inverted_index.items():
            for pos in pos_list:
                positions[pos] = word
        words = [positions[i] for i in sorted(positions.keys())]
        return " ".join(words)
    except Exception:
        return ""


# ── Source: PubMed ────────────────────────────────────────────────────────────

def _search_pubmed(query: str, max_results: int) -> list:
    """
    Search PubMed via NCBI E-utilities (no API key required, but rate-limited).
    Two-step: esearch (get PMIDs) → efetch (get full records in XML).
    Only called when the topic is classified as medical/biological.
    """
    try:
        # Step 1: esearch — get PMIDs
        encoded = urllib.parse.quote(query)
        esearch_url = (
            f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
            f"?db=pubmed&term={encoded}&retmax={max_results * 2}"
            f"&sort=relevance&retmode=json"
        )

        req = urllib.request.Request(esearch_url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=20, context=SSL_CTX) as resp:
            esearch_data = json.loads(resp.read())

        pmids = esearch_data.get("esearchresult", {}).get("idlist", [])
        if not pmids:
            return []

        print(f"    [PubMed] esearch returned {len(pmids)} PMIDs")

        # Step 2: efetch — get full records in XML
        # Rate limit sleep is placed between esearch→efetch, not inside each
        # worker iteration, so we hold the executor thread for only one pause.
        time.sleep(0.35)
        ids_str   = ",".join(pmids[:max_results * 2])
        efetch_url = (
            f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
            f"?db=pubmed&id={ids_str}&retmode=xml"
        )

        req = urllib.request.Request(efetch_url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as resp:
            xml_data = resp.read()

        root   = ET.fromstring(xml_data)
        papers = []

        for article in root.findall(".//PubmedArticle"):
            try:
                # Title
                title_el = article.find(".//ArticleTitle")
                title    = "".join(title_el.itertext()).strip() if title_el is not None else ""
                if not title:
                    continue

                # Abstract — may be structured with multiple AbstractText sections
                abstract_parts = []
                for at in article.findall(".//AbstractText"):
                    label = at.get("Label", "")
                    text  = "".join(at.itertext()).strip()
                    if text:
                        abstract_parts.append(f"{label}: {text}" if label else text)
                abstract = " ".join(abstract_parts)
                if len(abstract) < 50:
                    continue

                # Authors
                authors = []
                for author in article.findall(".//Author")[:6]:
                    last  = author.findtext("LastName", "")
                    first = author.findtext("ForeName", "")
                    if last:
                        authors.append(f"{first} {last}".strip())

                # Year
                pub_date = article.find(".//PubDate")
                year = pub_date.findtext("Year", "") if pub_date is not None else ""

                # PMID
                pmid_el = article.find(".//PMID")
                pmid    = pmid_el.text.strip() if pmid_el is not None else ""
                link    = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" if pmid else ""

                # Journal
                journal_el = article.find(".//Journal/Title")
                venue      = journal_el.text.strip() if journal_el is not None else "PubMed"

                papers.append({
                    "title":     title,
                    "abstract":  abstract,
                    "authors":   authors,
                    "year":      year,
                    "published": year,
                    "url":       link,
                    "citations": 0,   # PubMed doesn't provide citation count natively
                    "source":    "PubMed",
                    "venue":     venue,
                    "_arxiv_id": "",
                    "_doi":      "",
                })

                if len(papers) >= max_results:
                    break

            except Exception as inner_e:
                print(f"    [PubMed] parse error on one article: {inner_e}")
                continue

        return papers

    except Exception as e:
        print(f"    [PubMed] error for query '{query[:50]}': {e}")
        return []


# ── Deduplication ─────────────────────────────────────────────────────────────

def _deduplicate(papers: list) -> list:
    """
    Remove duplicate papers. A paper is a duplicate if:
      1. It shares an arXiv ID with another paper, OR
      2. It shares a DOI with another paper, OR
      3. Its normalised title matches another paper (>= 90% similarity).

    When duplicates are found, prefer the version with the highest citation count
    and the most complete metadata (URL, abstract length).
    """
    seen_arxiv = {}   # arxiv_id → index in unique list
    seen_doi   = {}   # doi      → index in unique list
    seen_title = {}   # norm_title → index in unique list
    unique     = []

    def _norm_title(t: str) -> str:
        return re.sub(r"[^a-z0-9]", "", t.lower())

    def _is_better(candidate: dict, existing: dict) -> bool:
        """Return True if candidate has more complete/authoritative data."""
        c_score = (
            (candidate.get("citations", 0) or 0) * 10 +
            len(candidate.get("abstract", "")) +
            (5 if candidate.get("url") else 0) +
            (3 if candidate.get("venue") else 0)
        )
        e_score = (
            (existing.get("citations", 0) or 0) * 10 +
            len(existing.get("abstract", "")) +
            (5 if existing.get("url") else 0) +
            (3 if existing.get("venue") else 0)
        )
        return c_score > e_score

    def _merge(existing: dict, candidate: dict) -> dict:
        """Merge the better fields from both versions."""
        merged = dict(existing)
        # Take the higher citation count
        merged["citations"] = max(
            existing.get("citations", 0) or 0,
            candidate.get("citations", 0) or 0,
        )
        # Take the longer abstract
        if len(candidate.get("abstract", "")) > len(existing.get("abstract", "")):
            merged["abstract"] = candidate["abstract"]
        # Prefer a real URL over empty
        if not merged.get("url") and candidate.get("url"):
            merged["url"] = candidate["url"]
        # Record all sources this paper was found in
        sources = set()
        for s in [existing.get("source", ""), candidate.get("source", "")]:
            if s:
                sources.add(s)
        merged["source"] = ", ".join(sorted(sources))
        return merged

    for paper in papers:
        arxiv_id  = (paper.get("_arxiv_id") or "").strip()
        doi       = (paper.get("_doi")       or "").strip().lower()
        norm      = _norm_title(paper.get("title", ""))

        # Check for known duplicates
        dup_idx = None
        if arxiv_id and arxiv_id in seen_arxiv:
            dup_idx = seen_arxiv[arxiv_id]
        elif doi and doi in seen_doi:
            dup_idx = seen_doi[doi]
        elif norm and norm in seen_title:
            dup_idx = seen_title[norm]

        if dup_idx is not None:
            # Merge into existing
            unique[dup_idx] = _merge(unique[dup_idx], paper)
            continue

        # New unique paper
        idx = len(unique)
        unique.append(paper)

        if arxiv_id:
            seen_arxiv[arxiv_id] = idx
        if doi:
            seen_doi[doi] = idx
        if norm:
            seen_title[norm] = idx

    return unique


# ── Relevance Scoring ─────────────────────────────────────────────────────────

def _score_and_rank(
    papers: list,
    relevance_concepts: list,
    rejection_signals: list,
    canonical_topic: str,
) -> list:
    """
    Score each paper on four factors and sort descending.
    Returns only papers above RELEVANCE_THRESHOLD.

    Composite score = 0.50 * semantic + 0.25 * citation + 0.15 * recency + 0.10 * source
    """
    if not papers:
        return []

    # ── 4a: Semantic relevance via LLM batch scoring ──────────────
    llm_scores = _get_llm_relevance_scores(papers, relevance_concepts, rejection_signals, canonical_topic)

    # ── 4b: Citation score (log-normalised, 0-100) ────────────────
    citation_counts = [p.get("citations", 0) or 0 for p in papers]
    max_log_cite    = math.log1p(max(citation_counts) or 1)

    def citation_score(count: int) -> float:
        if max_log_cite == 0:
            return 50.0    # all papers have 0 citations — give neutral score
        return (math.log1p(count or 0) / max_log_cite) * 100

    # ── 4c: Recency score ─────────────────────────────────────────
    def recency_score(year_str: str) -> float:
        try:
            year = int(str(year_str)[:4])
            age  = CURRENT_YEAR - year
            if age <= 0:
                return 100.0
            elif age <= 3:
                return 100.0
            elif age <= 5:
                return 100.0 - (age - 3) * 20.0    # 60-100
            elif age <= 10:
                return 60.0 - (age - 5) * 6.0      # 30-60
            else:
                return max(10.0, 30.0 - (age - 10) * 2.0)
        except (ValueError, TypeError):
            return 50.0    # unknown year — neutral

    # ── 4d: Source authority score ────────────────────────────────
    SOURCE_SCORES = {
        "PubMed":           90,
        "Semantic Scholar": 75,
        "OpenAlex":         70,
        "arXiv":            60,
    }

    def source_score(paper: dict) -> float:
        src = paper.get("source", "")
        # If merged from multiple sources, take the highest
        parts = [s.strip() for s in src.split(",")]
        return max((SOURCE_SCORES.get(p, 60) for p in parts), default=60)

    # ── Combine scores ────────────────────────────────────────────
    scored = []
    for i, paper in enumerate(papers):
        sem   = float(llm_scores.get(i, 50))

        # Hard reject before composite calculation: if the LLM says the paper
        # is not semantically relevant, no amount of citation count or recency
        # can rescue it. This prevents highly-cited off-topic papers from passing.
        if sem < MIN_SEMANTIC_SCORE:
            log.debug(f"  rejected (semantic={sem:.0f}<{MIN_SEMANTIC_SCORE}): {paper['title'][:60]}")
            continue

        cite  = citation_score(paper.get("citations", 0) or 0)
        rec   = recency_score(paper.get("year") or paper.get("published", ""))
        src   = source_score(paper)

        composite = round(
            0.50 * sem +
            0.25 * cite +
            0.15 * rec +
            0.10 * src,
            1,
        )

        if composite < RELEVANCE_THRESHOLD:
            continue

        paper["relevance_score"]    = composite
        paper["semantic_score"]     = round(sem,  1)
        paper["citation_score"]     = round(cite, 1)
        paper["recency_score"]      = round(rec,  1)
        paper["source_score"]       = round(src,  1)
        scored.append(paper)

    scored.sort(key=lambda p: p["relevance_score"], reverse=True)
    return scored


def _get_llm_relevance_scores(
    papers: list,
    relevance_concepts: list,
    rejection_signals: list,
    canonical_topic: str,
) -> dict:
    """
    Call Gemini to score each paper's semantic relevance (0-100).
    Returns {paper_index: score} dict.
    Falls back to keyword-overlap scoring if LLM fails.
    """
    try:
        from llm import call_llm, relevance_scoring_prompt

        # Build a compact representation for the LLM — title + first 400 chars of abstract
        paper_summaries = []
        for i, p in enumerate(papers):
            paper_summaries.append({
                "index":    i,
                "title":    p.get("title", ""),
                "abstract": (p.get("abstract", "") or "")[:400],
            })

        papers_json  = json.dumps(paper_summaries, indent=2)
        prompt       = relevance_scoring_prompt(
            papers_json, relevance_concepts, rejection_signals, canonical_topic
        )
        result       = call_llm(prompt, expect_json=True)

        scores = {}
        for item in result:
            idx   = item.get("index")
            score = item.get("score", 50)
            if idx is not None:
                scores[idx] = max(0, min(100, int(score)))

        print(f"  [Relevance LLM] scored {len(scores)}/{len(papers)} papers")
        return scores

    except Exception as e:
        print(f"  [Relevance LLM] failed ({e}), using keyword fallback")
        return _keyword_relevance_scores(papers, relevance_concepts, rejection_signals)


def _keyword_relevance_scores(
    papers: list,
    relevance_concepts: list,
    rejection_signals: list,
) -> dict:
    """
    Lightweight keyword-overlap fallback when LLM scoring fails.
    Each matching relevance concept adds points; rejection signals subtract.
    """
    scores = {}
    concepts_lower  = [c.lower() for c in relevance_concepts]
    rejection_lower = [r.lower() for r in rejection_signals]

    for i, paper in enumerate(papers):
        text = (
            (paper.get("title",    "") or "") + " " +
            (paper.get("abstract", "") or "")
        ).lower()

        concept_hits   = sum(1 for c in concepts_lower   if c in text)
        rejection_hits = sum(1 for r in rejection_lower  if r in text)

        # Base: 50 + up to 50 for concept coverage − 30 per rejection hit
        n_concepts = max(len(concepts_lower), 1)
        score = 50 + (concept_hits / n_concepts) * 50 - rejection_hits * 30
        scores[i] = max(0, min(100, round(score)))

    return scores


# ── Mock fallback ─────────────────────────────────────────────────────────────

def _mock_papers(topic: str, max_results: int) -> list:
    """Last-resort demo papers when all real sources fail."""
    import random
    methods = ["deep learning", "transformer", "neural network", "BERT", "GPT"]
    years   = ["2022", "2023", "2024"]
    papers  = []
    for i in range(min(max_results, 3)):
        method = random.choice(methods)
        year   = random.choice(years)
        papers.append({
            "title":           f"[DEMO] {topic.title()}: A {method.title()} Approach ({i+1})",
            "abstract":        (
                f"This paper investigates {topic} using {method} techniques. "
                f"We propose a novel approach addressing key limitations. "
                f"Our method achieves state-of-the-art results on multiple benchmarks. "
                f"Future work will explore broader applications."
            ),
            "authors":         [f"Author {chr(65+i)}", f"Author {chr(66+i)}"],
            "year":            year,
            "published":       f"{year}-01-01",
            "url":             f"https://arxiv.org/search/?query={urllib.parse.quote(topic)}",
            "citations":       0,
            "source":          "Demo",
            "venue":           "Demo",
            "relevance_score": 50,
            "_arxiv_id":       "",
            "_doi":            "",
        })
    return papers


# ── PDF and URL extractors (unchanged) ───────────────────────────────────────

def extract_from_pdf(file_obj):
    try:
        import fitz
        file_bytes = file_obj.read()
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        text = _extract_body(text)
        return clean_extracted(clean_pdf_text(text))
    except ImportError:
        try:
            from pdfminer.high_level import extract_text_to_fp
            from pdfminer.layout import LAParams
            file_obj.seek(0)
            output = io.StringIO()
            extract_text_to_fp(file_obj, output, laparams=LAParams())
            text = _extract_body(output.getvalue())
            return clean_extracted(clean_pdf_text(text))
        except Exception as e:
            print(f"PDF extraction error: {e}")
            return None
    except Exception as e:
        print(f"PDF extraction error: {e}")
        return None


def _extract_body(text: str) -> str:
    """Skip title/author block; start from Abstract then Introduction."""
    abstract_match = re.search(
        r"\bAbstract\b[:\s\u2014\u2013-]*(.*?)"
        r"(?=\b(Introduction|Keywords|Index Terms|1\.|I\.)\b)",
        text, re.DOTALL | re.IGNORECASE,
    )
    if abstract_match:
        abstract = abstract_match.group(1).strip()
        intro_match = re.search(r"\b(Introduction|1\.|I\.)\b", text, re.IGNORECASE)
        body = text[intro_match.start():] if intro_match else text[abstract_match.end():]
        return abstract + "\n\n" + body

    intro_match = re.search(r"\b(Introduction|1\.|I\.)\b", text, re.IGNORECASE)
    if intro_match:
        return text[intro_match.start():]

    lines = text.split("\n")
    body  = "\n".join(lines[50:])
    return body if len(body.strip()) > 200 else text


def extract_from_url(url: str):
    try:
        if "arxiv.org/pdf" in url:
            url = url.replace("/pdf/", "/abs/").replace(".pdf", "")
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15, context=SSL_CTX) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
        html = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL)
        html = re.sub(r"<style[^>]*>.*?</style>",  "", html, flags=re.DOTALL)
        if "arxiv.org" in url:
            m = re.search(
                r'<blockquote[^>]*class="abstract"[^>]*>(.*?)</blockquote>',
                html, re.DOTALL,
            )
            if m:
                text = re.sub(r"<[^>]+>", " ", m.group(1))
                return clean_extracted(text)
        text = re.sub(r"<[^>]+>", " ", html)
        return clean_extracted(text)
    except Exception as e:
        print(f"URL extraction error: {e}")
        return None


def clean_pdf_text(text: str) -> str:
    if not text:
        return text
    text = re.sub(r"\b[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}\b", "", text)
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"www\.\S+", "", text)
    text = re.sub(
        r"\b(References|Bibliography|REFERENCES|Works Cited)\b.*",
        "", text, flags=re.DOTALL,
    )
    text = re.sub(
        r"\n\d+\s*(Department|University|Institute|College|School)[^\n]*",
        "", text,
    )
    text = re.sub(r"\[\d+\]", "", text)
    text = re.sub(r"\(\w+,\s*\d{4}\)", "", text)
    lines = [l for l in text.split("\n") if len(l.strip()) > 30 or l.strip() == ""]
    text  = "\n".join(lines)
    text  = re.sub(r"\n{3,}", "\n\n", text)
    text  = re.sub(r" {2,}", " ", text)
    return text.strip()


def clean_extracted(text: str):
    if not text:
        return None
    text  = re.sub(r"\s+", " ", text)
    lines = [l.strip() for l in text.split(".") if len(l.strip()) > 20]
    text  = ". ".join(lines)
    return text.strip() if len(text) > 100 else None
