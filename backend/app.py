"""
app.py — Flask API server
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import time

from logger import get_logger
from analyzer import analyze_text
from extractors import extract_from_pdf, extract_from_url, search_papers
from literature_review import generate_literature_review
from paper_draft import generate_paper_draft
from storage import (
    create_workspace, list_workspaces, load_workspace, delete_workspace,
    save_papers, save_analyses, save_combined, save_chat_message,
    toggle_favorite, update_last_opened, update_metadata, save_uploaded_file
)
import database
from dotenv import load_dotenv
load_dotenv()

log = get_logger(__name__)

app = Flask(__name__, static_folder='../frontend/dist', static_url_path='')
CORS(app)

# Initialize persistent SQLite database
database.init_db()


@app.before_request
def _log_request():
    request._start_time = time.perf_counter()
    if not request.path.startswith('/assets'):
        log.info(f"→ {request.method} {request.path}")


@app.after_request
def _log_response(response):
    if not request.path.startswith('/assets'):
        ms = (time.perf_counter() - getattr(request, '_start_time', time.perf_counter())) * 1000
        level = log.warning if response.status_code >= 400 else log.info
        level(f"← {response.status_code} {request.method} {request.path} [{ms:.0f}ms]")
    return response


@app.errorhandler(Exception)
def _handle_exception(e):
    log.error(f"Unhandled exception on {request.method} {request.path}: {e}", exc_info=True)
    return jsonify({"error": "Internal server error"}), 500


@app.route('/')
def serve():
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/<path:path>')
def static_files(path):
    fp = os.path.join(app.static_folder, path)
    if os.path.exists(fp):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/health')
def health():
    api_key_set = bool(os.environ.get("GEMINI_API_KEY", ""))
    return jsonify({"status": "ok", "llm": "gemini-2.5-flash", "api_key_configured": api_key_set})


# ── Authentication & User Database Endpoints ─────────────────────────────────

def _get_current_user():
    """Extract and validate bearer token from request headers or query params."""
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif "token" in request.args:
        token = request.args.get("token")
    if not token:
        return None
    return database.get_user_from_token(token)


@app.route('/api/auth/register', methods=['POST'])
def auth_register():
    data = request.get_json() or {}
    email = data.get("email", "")
    password = data.get("password", "")
    name = data.get("name", "")
    try:
        res = database.register_user(email, password, name)
        log.info(f"New user registered: {email} (id: {res['user']['id']})")
        return jsonify({"status": "ok", **res}), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        log.error(f"Registration error: {e}")
        return jsonify({"error": "Failed to create account. Please try again."}), 500


@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    data = request.get_json() or {}
    email = data.get("email", "")
    password = data.get("password", "")
    try:
        res = database.authenticate_user(email, password)
        log.info(f"User authenticated: {email} (id: {res['user']['id']})")
        return jsonify({"status": "ok", **res}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 401
    except Exception as e:
        log.error(f"Login error: {e}")
        return jsonify({"error": "Failed to sign in. Please try again."}), 500


@app.route('/api/auth/me', methods=['GET'])
def auth_me():
    user = _get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    return jsonify({"status": "ok", "user": user})


@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        database.revoke_token(token)
    return jsonify({"status": "ok"})



@app.route('/api/workspaces', methods=['GET'])
def get_workspaces():
    user = _get_current_user()
    user_id = user["id"] if user else None
    allowed_ids = database.get_user_workspace_ids(user_id) if user_id else None
    return jsonify(list_workspaces(user_id=user_id, allowed_ids=allowed_ids))


@app.route('/api/workspaces', methods=['POST'])
def create_new_workspace():
    data  = request.get_json() or {}
    query = data.get('query', 'Untitled').strip()
    user = _get_current_user()
    user_id = user["id"] if user else None
    user_email = user["email"] if user else None
    ws = create_workspace(query, user_id=user_id, user_email=user_email)
    if user_id:
        database.link_user_workspace(user_id, ws["id"])
    log.debug(f"create_workspace id={ws['id']} user_id={user_id} query='{query}'")
    return jsonify(ws), 201


@app.route('/api/workspaces/<wid>', methods=['GET'])
def get_workspace(wid):
    user = _get_current_user()
    user_id = user["id"] if user else None
    ws = load_workspace(wid, user_id=user_id)
    if not ws:
        return jsonify({"error": "Not found"}), 404
    update_last_opened(wid)
    return jsonify(ws)


@app.route('/api/workspaces/<wid>', methods=['DELETE'])
def remove_workspace(wid):
    user = _get_current_user()
    user_id = user["id"] if user else None
    if not delete_workspace(wid, user_id=user_id):
        return jsonify({"error": "Not found or unauthorized"}), 404
    if user_id:
        database.unlink_user_workspace(user_id, wid)
    return jsonify({"deleted": True})


@app.route('/api/favorite/<wid>', methods=['POST'])
def favorite_workspace(wid):
    return jsonify({"favorite": toggle_favorite(wid)})


@app.route('/api/workspaces/<wid>/chat', methods=['POST'])
def add_chat(wid):
    data    = request.get_json()
    role    = data.get('role', 'user')
    content = data.get('content', '').strip()
    if not content:
        return jsonify({"error": "Empty message"}), 400
    return jsonify(save_chat_message(wid, role, content)), 201


@app.route('/api/paper-draft', methods=['POST'])
def paper_draft():
    data              = request.get_json()
    papers            = data.get('papers', [])
    title             = data.get('title', '').strip()
    research_question = data.get('research_question', '').strip()
    methodology       = data.get('methodology', '')
    contributions     = data.get('contributions', '')
    target_venue      = data.get('target_venue', '')
    sections          = data.get('sections', [])
    if not papers:
        return jsonify({"error": "No papers provided"}), 400
    if not title or not research_question:
        return jsonify({"error": "Title and research question are required"}), 400
    try:
        result = generate_paper_draft(
            papers, title, research_question, methodology,
            contributions, target_venue, sections
        )
        return jsonify(result)
    except RuntimeError as e:
        if str(e).startswith("RATE_LIMIT"):
            return jsonify({"error": "Gemini API rate limit reached. Please wait 1–2 minutes and try again. (Free-tier quota)"}), 429
        raise
    except Exception as e:
        log.error(f"paper_draft failed: {e}", exc_info=True)
        return jsonify({"error": "Paper draft generation failed. Please try again."}), 500


@app.route('/api/literature-review', methods=['POST'])
def literature_review():
    data   = request.get_json()
    papers = data.get('papers', [])
    topic  = data.get('topic', '')
    wid    = data.get('workspace_id')
    if len(papers) < 2:
        return jsonify({"error": "At least 2 papers required"}), 400
    result = generate_literature_review(papers, topic)
    return jsonify(result)


@app.route('/analyze/text', methods=['POST'])
def analyze_raw_text():
    data = request.get_json()
    text = data.get('text', '').strip()
    if not text:
        return jsonify({"error": "No text provided"}), 400
    return jsonify(analyze_text(text))


@app.route('/analyze/pdf', methods=['POST'])
def analyze_pdf():
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files['file']
    wid  = request.form.get('workspace_id')
    text = extract_from_pdf(file)
    if not text:
        return jsonify({"error": "Could not extract text"}), 400
    result = analyze_text(text)
    result['source'] = file.filename
    if wid:
        file.seek(0)
        save_uploaded_file(wid, file.filename, file.read())
        save_analyses(wid, [result])
        update_metadata(wid, {"mode": "pdf", "query": file.filename})
        user = _get_current_user()
        if user:
            database.link_user_workspace(user["id"], wid)
            update_metadata(wid, {"user_id": user["id"], "user_email": user["email"]})
    return jsonify(result)


@app.route('/analyze/pdfs', methods=['POST'])
def analyze_multiple_pdfs():
    files = request.files.getlist('files')
    wid   = request.form.get('workspace_id')
    if not files:
        return jsonify({"error": "No files uploaded"}), 400
    results, all_text = [], ""
    for file in files:
        text = extract_from_pdf(file)
        if text:
            a = analyze_text(text)
            a['title']  = file.filename
            a['source'] = file.filename
            results.append(a)
            all_text += " " + text
            if wid:
                file.seek(0)
                save_uploaded_file(wid, file.filename, file.read())
    if not results:
        return jsonify({"error": "Could not extract text from any PDF"}), 400
    combined = analyze_text(all_text) if len(results) > 1 else results[0]
    combined['title'] = f"Combined: {len(results)} PDFs"
    if wid:
        save_analyses(wid, results)
        user = _get_current_user()
        if user:
            database.link_user_workspace(user["id"], wid)
            update_metadata(wid, {"user_id": user["id"], "user_email": user["email"]})
    return jsonify({"papers": results, "combined": combined, "paper_count": len(results)})


@app.route('/analyze/url', methods=['POST'])
def analyze_url():
    data = request.get_json()
    url  = data.get('url', '').strip()
    wid  = data.get('workspace_id')
    if not url:
        return jsonify({"error": "No URL provided"}), 400
    text = extract_from_url(url)
    if not text:
        return jsonify({"error": "Could not extract content"}), 400
    result = analyze_text(text)
    result['source'] = url
    if wid:
        save_analyses(wid, [result])
        update_metadata(wid, {"mode": "url", "query": url})
        user = _get_current_user()
        if user:
            database.link_user_workspace(user["id"], wid)
            update_metadata(wid, {"user_id": user["id"], "user_email": user["email"]})
    return jsonify(result)


@app.route('/analyze/topic', methods=['POST'])
def analyze_topic():
    data       = request.get_json()
    topic      = data.get('topic', '').strip()
    max_papers = data.get('max_papers', 10)
    wid        = data.get('workspace_id')

    if not topic:
        log.warning("analyze_topic called with empty topic")
        return jsonify({"error": "No topic provided"}), 400

    log.info(f"analyze_topic topic='{topic}' max_papers={max_papers} wid={wid}")

    # ── Retrieve papers via the upgraded multi-source pipeline ────────────────
    # search_papers() handles: topic expansion → multi-source search →
    # deduplication → relevance scoring → ranking
    papers = search_papers(topic, max_results=max_papers)

    if not papers:
        return jsonify({"error": "No papers found for this topic"}), 404

    # ── Analyze each paper individually with Gemini (parallel) ──────────────
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def _analyze_paper(p):
        a = analyze_text(p['abstract'])
        a.update({
            "title":           p['title'],
            "authors":         p.get('authors', []),
            "year":            p.get('year', str(p.get('published', ''))[:4] if p.get('published') else ''),
            "published":       p.get('published', p.get('year', '')),
            "url":             p.get('url', ''),
            "source":          p.get('source', ''),
            "venue":           p.get('venue', ''),
            "citations":       p.get('citations', 0),
            "abstract":        p['abstract'],
            "relevance_score": p.get('relevance_score', 0),
            "semantic_score":  p.get('semantic_score', 0),
            "citation_score":  p.get('citation_score', 0),
            "recency_score":   p.get('recency_score', 0),
            "source_score":    p.get('source_score', 0),
        })
        return a

    results = [None] * len(papers)
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(_analyze_paper, p): i for i, p in enumerate(papers)}
        for fut in as_completed(futures):
            try:
                results[futures[fut]] = fut.result()
            except Exception as exc:
                log.warning(f"analyze_paper failed for paper #{futures[fut]}: {exc}")
                # Keep the slot as None; filter below before synthesis
    results = [r for r in results if r is not None]
    if not results:
        return jsonify({"error": "All paper analyses failed"}), 500

    # ── Build combined multi-paper analysis ───────────────────────────────────
    from llm import call_llm, multi_paper_analysis_prompt
    from analyzer import compute_stats
    import json as _json

    try:
        # Pass the Stage 1 understanding + Stage 2 analysis for each paper so the
        # synthesis LLM reasons from structured understanding, not extracted text.
        paper_objects = []
        for r in results:
            understanding = r.get("_understanding", {})
            lim_structured = r.get("_limitations_structured", {})
            # Compact structured limitations (list per category) for synthesis
            lim_flat = r.get("limitations", [])

            paper_objects.append({
                "title":   r.get("title", ""),
                "authors": r.get("authors", []),
                "year":    r.get("year", r.get("published", "")),
                "citations": r.get("citations", 0),
                # Stage 1 understanding — gives synthesis the domain/problem context
                "understanding": {
                    "domain":            understanding.get("research_domain", ""),
                    "subdomain":         understanding.get("research_subdomain", ""),
                    "problem_area":      understanding.get("problem_area", ""),
                    "application_area":  understanding.get("application_area", ""),
                    "proposed_approach": understanding.get("proposed_approach", ""),
                    "novelty":           understanding.get("novelty", ""),
                    "datasets":          understanding.get("datasets", []),
                    "evaluation":        understanding.get("evaluation", {}),
                    "key_findings":      understanding.get("key_findings", []),
                    "prior_art":         understanding.get("prior_art", ""),
                    "stated_limitations": understanding.get("stated_limitations", ""),
                    "unstated_constraints": understanding.get("unstated_constraints", ""),
                },
                # Stage 2 analysis outputs
                "analysis": {
                    "summary":           r.get("summary", r.get("executive_summary", "")),
                    "limitations":       lim_structured if lim_structured else {"general": lim_flat[:4]},
                    "research_gaps":     r.get("research_gaps", {}),
                    "future_scope":      r.get("future_scope", {}),
                    "strengths":         r.get("strengths", []),
                    "weaknesses":        r.get("weaknesses", []),
                    "key_findings":      r.get("results_and_findings", []),
                },
            })

        papers_json_str = _json.dumps(paper_objects, indent=2)
        # Cap at 12000 chars to stay within context; synthesis prompt adds its own text
        if len(papers_json_str) > 12000:
            papers_json_str = papers_json_str[:12000] + "\n...(truncated)..."

        combined = call_llm(multi_paper_analysis_prompt(papers_json_str, topic), expect_json=True)
        combined['title'] = f"Combined: {topic}"
        all_text = " ".join(p['abstract'] for p in papers)
        combined['stats'] = compute_stats(all_text)

        # Map synthesis output fields to flat keys the UI (SingleAnalysis) expects
        def _extract_str(item, *keys):
            if isinstance(item, dict):
                for k in keys:
                    if item.get(k):
                        return str(item[k])
            return str(item) if item else ""

        combined['summary'] = combined.get('synthesis_summary', '')
        combined['research_gaps_flat'] = [
            _extract_str(g, 'gap', 'evidence')
            for g in combined.get('recurring_research_gaps', [])
        ]
        combined['limitations'] = [
            _extract_str(l, 'limitation', 'impact')
            for l in combined.get('recurring_limitations', [])
        ]
        combined['future_scope_flat'] = [
            _extract_str(o, 'opportunity', 'rationale')
            for o in combined.get('future_research_opportunities', [])
        ]
        combined['contributions'] = [
            _extract_str(t, 'description', 'theme')
            for t in combined.get('common_themes', [])
        ]
        combined['important_sentences'] = [
            str(s) for s in combined.get('areas_of_agreement', [])
        ]
        combined['methods'] = [str(m) for m in combined.get('methods', [])]

    except Exception as e:
        log.warning(f"Multi-paper LLM synthesis failed, using merge fallback: {e}")
        combined = _merge_analyses(results, topic)

    if wid:
        save_papers(wid, papers)
        save_analyses(wid, results)
        save_combined(wid, combined)
        update_metadata(wid, {"mode": "topic", "paper_count": len(papers)})
        user = _get_current_user()
        if user:
            database.link_user_workspace(user["id"], wid)
            update_metadata(wid, {"user_id": user["id"], "user_email": user["email"]})

    log.info(f"analyze_topic done: {len(papers)} papers returned for '{topic}'")
    return jsonify({
        "topic":             topic,
        "paper_count":       len(papers),
        "individual_papers": results,
        "combined_analysis": combined,
        "workspace_id":      wid,
    })


def _merge_str_lists(*lists):
    """Deduplicate and merge string lists using first-60-char key comparison."""
    seen, merged = set(), []
    for lst in lists:
        for item in (lst or []):
            key = item.lower()[:60] if isinstance(item, str) else str(item)
            if key not in seen:
                seen.add(key)
                merged.append(item)
    return merged


def _merge_analyses(results: list, topic: str) -> dict:
    """Fallback: merge individual Stage 2 analyses without a second LLM call."""
    from analyzer import compute_stats

    all_summaries   = [r.get("summary", "") for r in results if r.get("summary")]
    all_gaps        = _merge_str_lists(*[r.get("research_gaps_flat", []) for r in results])
    # limitations may be a flat list (post-normalization) or structured dict
    all_limitations = _merge_str_lists(*[
        r.get("limitations", []) if isinstance(r.get("limitations"), list)
        else [i for sub in r.get("limitations", {}).values() if isinstance(sub, list) for i in sub]
        for r in results
    ])
    all_future      = _merge_str_lists(*[r.get("future_scope_flat",  []) for r in results])
    all_contribs    = _merge_str_lists(*[r.get("contributions",      []) for r in results])
    all_methods     = _merge_str_lists(*[r.get("methods",            []) for r in results])

    seen_kw, all_keywords = set(), []
    for r in results:
        for kw in r.get("keywords", []):
            t = kw.get("term", "").lower()
            if t not in seen_kw:
                seen_kw.add(t)
                all_keywords.append(kw)
    all_keywords.sort(key=lambda x: x.get("score", 0), reverse=True)

    all_text = " ".join(r.get("abstract", "") for r in results)

    return {
        "title":              f"Combined: {topic}",
        "summary":            " ".join(all_summaries),
        "keywords":           all_keywords[:12],
        "research_gaps_flat": all_gaps[:6],
        "limitations":        all_limitations[:6],
        "future_scope_flat":  all_future[:6],
        "contributions":      all_contribs[:6],
        "methods":            all_methods[:8],
        "important_sentences": _merge_str_lists(
            *[r.get("important_sentences", []) for r in results]
        )[:5],
        "stats": compute_stats(all_text),
    }


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
