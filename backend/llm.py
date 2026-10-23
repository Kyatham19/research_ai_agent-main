"""
llm.py — Gemini API wrapper for ResearchAI
Research Analyst Edition: evidence-based, chain-of-thought prompts
"""

import os
# Force pure-Python protobuf — the C extension (google._upb._message) uses
# metaclasses with custom tp_new which are not supported on Python 3.14+.
os.environ.setdefault('PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION', 'python')

import json
import re
import time
import google.genai as genai
from logger import get_logger

log = get_logger(__name__)
_configured = False


def _configure():
    global _configured
    if _configured:
        return
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY not set.")
    genai.configure(api_key=api_key)
    _configured = True


def _get_model(large_output: bool = False):
    _configure()
    return genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        generation_config={
            "temperature": 0.2,
            "top_p": 0.9,
            "max_output_tokens": 8192 if large_output else 4096,
        }
    )


def call_llm(prompt: str, expect_json: bool = True, max_retries: int = 3, large_output: bool = False):
    import random as _random
    model = _get_model(large_output=large_output)
    log.debug(f"LLM call: prompt={len(prompt)} chars expect_json={expect_json}")
    last_error = None
    for attempt in range(max_retries):
        try:
            t0 = time.perf_counter()
            response = model.generate_content(prompt)
            elapsed = (time.perf_counter() - t0) * 1000
            text = response.text.strip()
            log.info(f"LLM response: {len(text)} chars in {elapsed:.0f}ms")

            if not expect_json:
                return text
            cleaned = re.sub(r"^```(?:json)?\s*", "", text)
            cleaned = re.sub(r"\s*```$", "", cleaned).strip()
            try:
                result = json.loads(cleaned)
                log.debug("LLM JSON parse: success")
                return result
            except json.JSONDecodeError:
                log.debug("LLM JSON parse: direct parse failed, attempting regex extraction")
                match = re.search(r"[\[{].*[\]}]", cleaned, re.DOTALL)
                if match:
                    result = json.loads(match.group())
                    log.debug("LLM JSON parse: regex extraction succeeded")
                    return result
                log.error(f"LLM JSON parse: failed completely. Response head: {text[:200]}")
                raise ValueError(f"Could not parse JSON:\n{text[:300]}")
        except Exception as e:
            last_error = e
            err_str = str(e).lower()
            if any(sig in err_str for sig in ("429", "quota", "rate limit", "resource exhausted")):
                # Respect the API's suggested retry_delay (usually 25-60s on free tier)
                import re as _re
                delay_match = _re.search(r'seconds:\s*(\d+)', str(e))
                suggested = int(delay_match.group(1)) if delay_match else 30
                wait = max(suggested + 5, 30) + _random.uniform(0, 5)
                log.warning(f"Rate limited (attempt {attempt+1}/{max_retries}), waiting {wait:.0f}s")
                if attempt < max_retries - 1:
                    time.sleep(wait)
                    continue
                # All retries exhausted — raise a clear error for the caller
                raise RuntimeError(
                    "RATE_LIMIT: Gemini API quota exceeded. "
                    "Please wait a minute and try again, or check your API quota at "
                    "https://aistudio.google.com/app/apikey"
                ) from e
            raise
    raise last_error


# ── Topic Intelligence ─────────────────────────────────────────────────────────

def topic_expansion_prompt(topic: str) -> str:
    return f"""You are a research librarian and academic search specialist.

A user has entered this research topic: "{topic}"

Your job is to deeply understand what they are actually looking for and produce a structured
search plan that will retrieve the most relevant academic papers possible.

Return ONLY a valid JSON object with this exact structure:

{{
  "canonical_topic": "The properly formatted, full academic name of this research topic",
  "domain": "Primary academic domain — one of: medical, computer_science, physics, biology, chemistry, engineering, mathematics, social_science, economics, other",
  "is_medical": true or false,
  "arxiv_categories": [
    "List of the most relevant arXiv category codes for this topic.",
    "Examples: cs.CV, cs.LG, cs.AI, eess.IV, q-bio.QM, stat.ML, physics.med-ph",
    "Include 2-4 categories maximum. Use real arXiv category codes only."
  ],
  "search_queries": [
    "Query 1 — the most direct, specific academic phrasing of this topic",
    "Query 2 — a related subtopic or method commonly used in this area",
    "Query 3 — an adjacent technical angle (e.g. dataset, task, evaluation)",
    "Query 4 — a clinical or applied variant (if applicable)",
    "Query 5 — a broader framing that catches relevant survey papers"
  ],
  "relevance_concepts": [
    "Core concept 1 that a relevant paper MUST substantially address",
    "Core concept 2",
    "Core concept 3",
    "Core concept 4",
    "Core concept 5",
    "Core concept 6"
  ],
  "rejection_signals": [
    "Signal 1 — if a paper is primarily about THIS, it is NOT relevant",
    "Signal 2",
    "Signal 3"
  ]
}}

Rules:
- search_queries must be natural academic English phrases, not keyword lists
- arxiv_categories must be real, valid arXiv category codes
- relevance_concepts must be SPECIFIC to the topic (not generic like "deep learning")
- rejection_signals help filter out papers that share keywords but are off-topic
- is_medical must be true if the topic involves clinical care, disease, anatomy, drugs, or diagnostics

Topic to analyse: "{topic}"
"""


# ── Relevance Scoring ──────────────────────────────────────────────────────────

def relevance_scoring_prompt(papers_json: str, relevance_concepts: list,
                              rejection_signals: list, canonical_topic: str) -> str:
    concepts_str  = "\n".join(f"  - {c}" for c in relevance_concepts)
    rejection_str = "\n".join(f"  - {r}" for r in rejection_signals)
    return f"""You are a research relevance evaluator. Score each paper for relevance to:
"{canonical_topic}"

HIGHLY RELEVANT if it substantially addresses:
{concepts_str}

REJECT (score < 20) if primarily about:
{rejection_str}

Scoring guide:
  90-100 : Directly about the topic. Core concepts in title and abstract.
  70-89  : Closely related. Addresses 3-4 core concepts.
  50-69  : Relevant but tangential. Shares methodology or domain.
  20-49  : Partial overlap. Mentions keywords but is primarily about something else.
  0-19   : Not relevant.

Return ONLY a valid JSON array in the same order as input:
[
  {{"index": 0, "score": 85, "reason": "Directly addresses X using Y on Z dataset"}},
  ...
]

Papers to score:
{papers_json}
"""


# ══════════════════════════════════════════════════════════════════════════════
# TWO-STAGE UNDERSTANDING → REASONING → OUTPUT PIPELINE
# ══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Paper Understanding ──────────────────────────────────────────────

def paper_understanding_prompt(text: str) -> str:
    """
    Stage 1 — READ and UNDERSTAND. The LLM builds a structured mental model
    of the paper. No summaries, no analysis, no output fields yet.

    Works for both short abstracts (~300 chars) and full papers (50 000+ chars).
    For long texts, samples start (abstract/intro) + end (conclusions/future work)
    so that all critical sections are always visible.
    """
    if len(text) > 7000:
        sampled = text[:4000] + "\n\n[...middle sections omitted...]\n\n" + text[-3000:]
    else:
        sampled = text

    is_abstract = len(text) < 2000
    scope_note = (
        "NOTE: You are working from an abstract only. Extract what is explicitly stated; "
        "for unstated fields use your best inference from context and mark them clearly."
        if is_abstract else
        "You have a full paper. Extract comprehensive understanding from all sections."
    )

    return f"""You are a senior researcher reading this paper for the first time.

Your ONLY task right now is to UNDERSTAND it — not to summarize, not to analyze, not to generate insights yet.

Build a complete, structured mental model: what the paper is, what it does, and what it discovers.

{scope_note}

Return ONLY a valid JSON object representing your understanding:

{{
  "research_domain": "Primary academic domain (e.g. Medical AI, Natural Language Processing, Computer Vision, Robotics, Climate Science)",

  "research_subdomain": "Specific subdomain combining field + technique (e.g. 'Retinal Image Analysis + Deep Learning', 'Transformer-based Question Answering')",

  "problem_area": "The precise technical or scientific problem this paper addresses — one sentence, specific not generic.",

  "application_area": "Real-world context where this research would be applied or deployed (e.g. 'Clinical screening in ophthalmology clinics', 'Search engine ranking')",

  "core_problem": "What specifically fails, breaks, or is missing without this work? State the problem as a researcher would — precise, not paraphrased from the abstract.",

  "motivation": "Why does this problem matter? Who is affected, at what scale, and what are the consequences of not solving it?",

  "prior_art": "What approaches existed before this paper? Name them specifically. Where exactly did they fall short — what did they fail to do or do poorly?",

  "proposed_approach": "What does this paper propose? Name the specific method, architecture, model, framework, or algorithm. Be concrete.",

  "novelty": "What is genuinely new here that has not been done before? What combination of ideas or techniques is original?",

  "datasets": [
    {{
      "name": "Dataset name (or 'not specified' if abstract only)",
      "domain": "What the data represents — subjects, language, modality, etc.",
      "size": "Number of samples / volume if stated",
      "source_type": "public benchmark / proprietary / newly collected / not specified",
      "coverage_gaps": "What populations, languages, domains, edge cases, or distributions does this dataset NOT include?"
    }}
  ],

  "evaluation": {{
    "metrics": ["Primary metric", "Secondary metric"],
    "baselines": ["Comparison method 1", "Comparison method 2"],
    "protocol": "How was evaluation set up? (cross-validation, held-out test, prospective trial, etc.)",
    "missing_evaluations": "What important evaluations does this paper NOT perform? (e.g. real-world trial, cross-dataset, ablation of X, user study)"
  }},

  "key_findings": [
    "Primary result with specific numbers if available (e.g. '94.3% accuracy vs 91.2% prior SOTA, +3.1% improvement')",
    "Secondary finding"
  ],

  "stated_limitations": "What does the paper itself say it cannot do or does poorly? Quote or closely paraphrase.",

  "unstated_constraints": "What implicit assumptions or constraints does the method make that the authors do NOT acknowledge? (e.g. requires GPU, only English text, clean data assumed, single-center study, etc.)"
}}

RULES:
- This is a READING step — do not generate summary, analysis, gaps, or future work.
- datasets[].coverage_gaps must reason about what is excluded, not just restate what is included.
- evaluation.missing_evaluations must identify real evaluation gaps specific to this paper's claims.
- unstated_constraints must find implicit assumptions not flagged by the authors.
- If working from an abstract, write 'Not stated in abstract' for fields that truly cannot be inferred.

Paper text:
{sampled}"""


# ── Stage 2: Reasoning → Analysis Output ──────────────────────────────────────

def paper_analysis_from_understanding_prompt(understanding: dict) -> str:
    """
    Stage 2 — REASON from the Stage 1 understanding to generate structured analysis.

    All outputs must be derived from reasoning about the understanding, NOT from
    extracting or rewriting paper text. The LLM acts as a researcher thinking
    about what the paper means, what it misses, and what should come next.
    """
    understanding_json = json.dumps(understanding, indent=2)
    domain       = understanding.get("research_domain", "this research domain")
    problem_area = understanding.get("problem_area", "the problem area")
    application  = understanding.get("application_area", "the application")

    return f"""You are a senior research analyst. You have deeply understood a paper.

Here is your structured understanding of the paper:
{understanding_json}

Now generate a complete research analysis. Everything you write must come from REASONING about
this understanding — not from copying or rewording the paper text.

CRITICAL CONSTRAINTS:
1. The executive_summary must NOT rewrite the abstract. Write it as a researcher explaining
   the work to a colleague who hasn't read it.
2. Limitations must be INFERRED from the methodology, dataset, and evaluation CHOICES —
   not extracted from any "limitations" section.
3. Research gaps must be DEDUCED from what the limitations leave unsolved.
4. AI-generated future scope must be PROPOSED by you as a researcher — go beyond what
   the authors say. Think about adjacent problems, emerging techniques, deployment realities.
5. NEVER return empty arrays. If the paper doesn't explicitly cover something, reason
   about it from what you do know.

Return ONLY a valid JSON object:

{{
  "executive_summary": "3-5 sentences. Start with the PROBLEM and WHY it matters. Then explain the APPROACH and what makes it novel. End with the KEY RESULT and what it means for {domain}. Do NOT start with 'This paper' or 'The paper'. Do NOT rewrite the abstract.",

  "limitations": {{
    "dataset_limitations": [
      "Reason from the dataset choices: which populations, languages, domains, or distributions are excluded? What does this exclusion mean for real-world applicability in {application}?"
    ],
    "methodological_limitations": [
      "Reason from the proposed approach: what assumptions does the method make? What inputs, scales, or conditions does it require that may not hold universally?"
    ],
    "computational_limitations": [
      "Reason from the model/method complexity: what compute resources are required? Can this be deployed without specialist infrastructure?"
    ],
    "scalability_limitations": [
      "Reason from the experimental scale: what breaks or degrades when the problem size, data volume, or user count is 10× larger?"
    ],
    "generalization_limitations": [
      "Reason from the evaluation scope: which domains, datasets, tasks, or populations were NOT tested? What does that omission mean for confidence in the results?"
    ],
    "deployment_limitations": [
      "Reason from the gap between research setting and practice: what engineering, regulatory, clinical, or operational challenges must be solved before this reaches {application}?"
    ]
  }},

  "research_gaps": {{
    "from_limitations": [
      "For each limitation category above, state the research gap it creates and why it matters for {domain}."
    ],
    "from_missing_datasets": [
      "What data — demographics, domains, languages, modalities — would be required to close the coverage gap identified in the understanding?"
    ],
    "from_missing_benchmarks": [
      "What evaluation benchmarks, comparison methods, or ablation studies are absent that would be required to fully validate this work?"
    ],
    "from_generalization": [
      "What untested conditions (domains, languages, populations, environments) would need to be evaluated to trust this approach broadly?"
    ],
    "from_deployment": [
      "What practical challenges in {application} remain unaddressed — latency, explainability, integration, regulation, cost?"
    ],
    "from_unsolved_problems": [
      "What fundamental aspects of '{problem_area}' remain unsolved even after this paper's contribution? What is the next open problem?"
    ]
  }},

  "future_scope": {{
    "author_suggested": [
      "Future directions the authors explicitly mention — paraphrase in your own words, do not copy text."
    ],
    "ai_generated": [
      "Direction 1 — DATASET EXTENSION: Identify the dataset coverage gap → propose a specific new dataset or collection strategy → explain what it would prove or enable.",
      "Direction 2 — METHOD IMPROVEMENT: Identify the most significant methodological weakness → propose a specific architectural or algorithmic approach to address it → explain the expected gain.",
      "Direction 3 — CROSS-DOMAIN TRANSFER: Identify an adjacent domain where this approach has not been applied → explain the transfer challenge → propose how to adapt the method.",
      "Direction 4 — DEPLOYMENT PATH: Identify the most critical deployment gap → propose a concrete engineering or research path → describe what real-world impact this would have.",
      "Direction 5 — EMERGING SYNTHESIS: Identify an emerging technique or trend in {domain} that this paper does not use → explain how combining it with this work would advance the field."
    ]
  }},

  "strengths": [
    "Strength 1 — a specific thing this paper does well, grounded in the findings or methodology choices",
    "Strength 2"
  ],

  "weaknesses": [
    "Weakness 1 — what a rigorous peer reviewer would specifically critique (scope, evaluation, claims)",
    "Weakness 2"
  ],

  "results_and_findings": [
    "Primary result with specific numbers from the understanding",
    "Secondary finding"
  ],

  "key_takeaways": [
    "The most important contribution or insight for a researcher in {domain}",
    "The most important implication for practitioners working on {application}"
  ],

  "keywords": [
    {{"term": "most central technical term in this paper", "score": 9}},
    {{"term": "method or model name", "score": 8}},
    {{"term": "domain-specific concept", "score": 8}},
    {{"term": "evaluation metric or benchmark", "score": 7}},
    {{"term": "application context term", "score": 7}}
  ],

  "methodology": {{
    "overview": "The approach in one clear sentence — your synthesis, not from the paper",
    "key_components": ["Component 1 and its specific role", "Component 2 and its role"],
    "novelty": "What is technically new — reasoned, not copied"
  }},

  "datasets": [
    {{
      "name": "Dataset name",
      "type": "public benchmark / proprietary / newly collected",
      "size": "Size if known",
      "domain": "What it covers"
    }}
  ],

  "evaluation": {{
    "metrics": ["Metric 1", "Metric 2"],
    "baselines": ["Baseline 1", "Baseline 2"],
    "protocol": "Evaluation setup — your synthesis"
  }},

  "research_problem": "The specific problem in one sentence — your formulation, not the paper's",
  "motivation":       "Why this matters — your reasoning from the understanding",
  "research_gap":     "The single most important gap this paper fills — your synthesis",
  "main_contribution": "The primary contribution in one sentence — your synthesis"
}}

RULES:
- executive_summary must NOT start with 'This paper' or 'The paper'. Start with the problem or domain.
- limitations are a dict with 6 sub-keys — each must have at least one entry with real reasoning.
- Each research_gaps entry must name what is missing AND explain the consequence for {domain}.
- ai_generated future_scope entries must follow the format: GAP IDENTIFIED → PROPOSED APPROACH → EXPECTED IMPACT.
- keywords must be domain-specific technical terms, not generic academic words.
- If the understanding says 'Not stated in abstract' for a field, INFER from what is available."""


# ── Single-call combined understanding + analysis (replaces 2-stage) ──────────

def paper_combined_prompt(text: str) -> str:
    """
    Single LLM call that does Stage 1 (understand) + Stage 2 (analyse) together.
    Replaces the previous two-call pipeline to halve LLM usage per paper.
    The model still builds understanding FIRST, then reasons from it — just
    within one response instead of two.
    """
    if len(text) > 7000:
        sampled = text[:4000] + "\n\n[...middle omitted...]\n\n" + text[-3000:]
    else:
        sampled = text

    is_abstract = len(text) < 2000
    scope_note = (
        "NOTE: This is an abstract only. Infer what you can; mark fields not stated."
        if is_abstract else
        "You have the full paper. Extract and reason comprehensively."
    )

    return f"""You are a senior research analyst reading a paper.

{scope_note}

STEP 1 — UNDERSTAND: Build a mental model of what this paper is, does, and discovers.
STEP 2 — REASON: From that understanding, generate a complete analysis.
Both steps happen in one response. Reasoning from understanding is mandatory — never extract or reword paper sentences.

Return ONLY valid JSON:

{{
  "_understanding": {{
    "research_domain": "Primary domain (e.g. NLP, Medical AI, Computer Vision)",
    "research_subdomain": "Specific subdomain + technique",
    "problem_area": "Precise technical problem — one specific sentence",
    "application_area": "Real-world deployment context",
    "proposed_approach": "Specific method / architecture / framework proposed",
    "novelty": "What is genuinely new that has not been done before",
    "datasets": [{{"name": "...", "domain": "...", "coverage_gaps": "..."}}],
    "evaluation": {{"metrics": [], "baselines": [], "missing_evaluations": "..."}},
    "key_findings": ["Primary result with numbers", "Secondary finding"],
    "stated_limitations": "What the paper itself says it cannot do",
    "unstated_constraints": "Implicit assumptions the authors do not acknowledge"
  }},

  "executive_summary": "3-5 sentences. Start with the PROBLEM and WHY it matters. Explain the APPROACH and novelty. End with KEY RESULT. Do NOT start with 'This paper'. Do NOT restate the abstract.",

  "limitations": {{
    "dataset_limitations":       ["Reasoned from dataset choices — excluded populations/domains"],
    "methodological_limitations": ["Reasoned from approach assumptions — what conditions must hold"],
    "computational_limitations":  ["Inferred from model complexity — deployment resource needs"],
    "scalability_limitations":    ["What degrades at 10× scale"],
    "generalization_limitations": ["Untested domains/populations from evaluation scope"],
    "deployment_limitations":     ["Engineering/regulatory/operational gaps before production"]
  }},

  "research_gaps": {{
    "from_limitations":      ["Gap created by each limitation category"],
    "from_missing_datasets": ["Data missing to close coverage gaps"],
    "from_missing_benchmarks": ["Absent evaluations needed to fully validate"],
    "from_generalization":   ["Untested conditions that limit trust"],
    "from_deployment":       ["Practical challenges unaddressed"],
    "from_unsolved_problems": ["Open fundamental problems remaining after this work"]
  }},

  "future_scope": {{
    "author_suggested": ["Future directions the authors mention — your words"],
    "ai_generated": [
      "DATASET GAP → specific new dataset strategy → what it proves",
      "METHOD WEAKNESS → specific architectural fix → expected gain",
      "CROSS-DOMAIN → adjacent domain transfer challenge → adaptation approach",
      "DEPLOYMENT → critical production gap → concrete engineering path",
      "EMERGING SYNTHESIS → new technique not used here → combined impact"
    ]
  }},

  "strengths":           ["Specific strength grounded in methodology or findings"],
  "weaknesses":          ["What a rigorous reviewer would specifically critique"],
  "results_and_findings": ["Primary result with numbers", "Secondary finding"],
  "contributions":       ["Key technical contribution 1", "Key contribution 2"],
  "methods":             ["Method/technique name 1", "Method 2"],
  "keywords": [
    {{"term": "central technical term", "score": 9}},
    {{"term": "method or model name",   "score": 8}},
    {{"term": "domain concept",         "score": 7}}
  ],
  "research_problem":   "The specific problem — your one-sentence formulation",
  "main_contribution":  "Primary contribution — your synthesis"
}}

RULES:
- executive_summary must NOT start with 'This paper' or 'The paper'.
- All limitation categories must have at least one entry with real reasoning.
- ai_generated future_scope must follow: GAP → APPROACH → IMPACT format.
- NEVER return empty arrays — infer from context if not explicitly stated.
- keywords must be domain-specific technical terms, not generic words.

Paper text:
{sampled}"""


# ── Stage 1 (legacy / fallback): single-shot paper analysis ───────────────────

def analyze_paper_prompt(text: str) -> str:
    """
    Forces the model to reason through the research narrative before generating
    any output field. Evidence must be cited from the paper text.

    Samples the start (abstract + intro + methods) and the end (conclusions +
    limitations + future work) of the paper so the LLM always sees the sections
    most likely to contain gaps, limitations, and future scope.
    """
    if len(text) > 7000:
        # Take first 4000 chars (abstract/intro) and last 3000 chars (conclusion/future work)
        sampled = text[:4000] + "\n\n[...middle sections omitted...]\n\n" + text[-3000:]
    else:
        sampled = text

    return f"""You are a senior research analyst, not a summarizer.

Your task is to deeply analyze the research paper below by reasoning through its
research narrative first, then extracting structured insights grounded in evidence.

REASONING PROTOCOL — work through these questions internally before writing any output:
1. What specific problem does this paper address? Why does it matter?
2. What gap in prior work motivates this paper? Is it stated explicitly or implied?
3. What is the core methodological contribution? What makes it novel?
4. What datasets were used? Are they standard benchmarks or custom?
5. How is performance evaluated? What metrics? Compared against what baselines?
6. What do the results actually show? Are the improvements significant?
7. What does the paper itself admit it cannot do or does poorly?
8. What would a rigorous peer reviewer criticize?
9. What future work do the authors explicitly suggest?
10. What future work is implied by the gaps and limitations but NOT stated by the authors?

After reasoning through the above, produce ONLY a valid JSON object:

{{
  "executive_summary": "3-4 sentences. State the problem, approach, key result, and significance. Must reference specific numbers or findings from the paper.",

  "research_problem": "The specific unsolved problem this paper targets. Quote or closely paraphrase the problem statement from the paper.",

  "motivation": "Why this problem matters. What breaks or fails without solving it? Ground in evidence from the paper.",

  "research_gap": "The precise gap in prior work this paper fills. Name the prior approaches that fall short and explain HOW they fall short.",

  "main_contribution": "The primary novel contribution. Be specific — name the proposed method, architecture, algorithm, or framework.",

  "methodology": {{
    "overview": "High-level description of the approach",
    "key_components": ["Component 1 with purpose", "Component 2 with purpose"],
    "novelty": "What is technically new compared to prior work"
  }},

  "datasets": [
    {{
      "name": "Dataset name",
      "type": "public benchmark / proprietary / curated",
      "size": "number of samples if mentioned",
      "domain": "what the data represents"
    }}
  ],

  "evaluation": {{
    "metrics": ["Metric 1", "Metric 2"],
    "baselines": ["Baseline model 1", "Baseline model 2"],
    "protocol": "How the evaluation was set up (train/test split, cross-validation, etc.)"
  }},

  "results_and_findings": [
    "Finding 1 — include specific numbers (e.g., 'achieved 94.3% accuracy, +2.1% over SOTA')",
    "Finding 2",
    "Finding 3"
  ],

  "strengths": [
    "Strength 1 — grounded in evidence from the paper",
    "Strength 2",
    "Strength 3"
  ],

  "weaknesses": [
    "Weakness 1 — what a rigorous reviewer would flag",
    "Weakness 2",
    "Weakness 3"
  ],

  "limitations": [
    "Limitation 1 — explicitly stated or clearly implied by the paper",
    "Limitation 2",
    "Limitation 3"
  ],

  "research_gaps": {{
    "from_limitations": ["Gap derived from a stated limitation"],
    "from_missing_datasets": ["Gap from narrow or missing data coverage"],
    "from_missing_benchmarks": ["Gap from lack of evaluation on standard benchmarks"],
    "from_generalization": ["Gap from untested generalization to other domains/tasks"],
    "from_deployment": ["Gap from real-world deployment challenges not addressed"],
    "from_unsolved_problems": ["Fundamental problem the paper leaves open"]
  }},

  "future_scope": {{
    "author_suggested": [
      "Future direction the authors explicitly state in the paper"
    ],
    "ai_generated": [
      "Future work inferred from research gap 1 — explain the reasoning",
      "Future work inferred from a limitation — explain what addressing it would unlock",
      "Future work from emerging trends not covered by this paper",
      "Novel application or extension not mentioned by the authors"
    ]
  }},

  "key_takeaways": [
    "The single most important insight from this paper",
    "Takeaway 2",
    "Takeaway 3"
  ],

  "keywords": [
    {{"term": "specific technical term", "score": 9}},
    {{"term": "method name", "score": 8}}
  ]
}}

RULES:
- Every field must be grounded in what the paper actually says or clearly implies.
- NEVER return empty arrays for research_gaps sub-keys, limitations, future_scope, strengths,
  weaknesses, or results_and_findings. If the paper text does not explicitly state something,
  make an evidence-based inference and explain the reasoning (e.g., "The paper evaluates only
  on X dataset; it likely does not generalise to Y because...").
- Do NOT generate generic statements like "future work could explore more datasets."
  Instead: "The paper evaluates only on [specific dataset]; extending to [adjacent domain] datasets
  such as [example] would test generalization of [specific component]."
- research_gaps must each trace back to a specific evidence source (limitation, missing eval, etc.)
- ai_generated future scope must explain the reasoning chain, not just name a direction.
- weaknesses must be what a peer reviewer would write, not what the authors admit.
- keywords must be specific technical terms from this paper, not generic words.

Paper text:
{sampled}"""


# ── Cross-Paper Synthesis ──────────────────────────────────────────════════════

def multi_paper_analysis_prompt(papers_json: str, topic: str) -> str:
    """
    Stage 3 — Cross-paper SYNTHESIS from structured understanding + analysis objects.

    Receives a JSON array where each element contains:
      - understanding: the Stage 1 structured understanding of the paper
      - analysis: key outputs from Stage 2 (summary, limitations, gaps, future scope)
      - metadata: title, authors, year, citations

    Generates genuine cross-paper intelligence — patterns, comparisons, trends,
    collective gaps — that no single paper reveals on its own.
    """
    return f"""You are a senior research analyst synthesizing a body of research on:
"{topic}"

You have been given structured understanding and analysis objects for each paper.
These were built through a two-stage deep reading process — not extracted text.

Your task is NOT to summarize papers one by one.
Your task is to SYNTHESIZE across all of them: find patterns, contradictions,
progressions, recurring gaps, and collective insights that only emerge from
looking at multiple papers together.

SYNTHESIS REASONING — think through these before writing:
1. What methodological families appear? Which approach dominates and why might that be?
2. Which datasets are shared across papers? Which papers use unique data — is there a reason?
3. Where do evaluation protocols diverge? What does inconsistency in measurement mean?
4. Which findings do multiple papers agree on independently? Where do they contradict?
5. What limitation appears in EVERY paper — what does that tell us about the field's blind spots?
6. What gap does NO paper address — not even partially? That is the most important finding.
7. Has the field improved over time? What has stagnated? What trajectory is emerging?
8. What would a meta-reviewer say about the maturity and health of this research area?

Papers with structured understanding and analysis:
{papers_json}

Now produce ONLY a valid JSON object:

{{
  "synthesis_summary": "5-7 sentences synthesizing collective findings. Must reference specific papers by title or finding. Must state what the field collectively knows, where it disagrees, and what remains unsolved. Do NOT list papers sequentially.",

  "common_themes": [
    {{
      "theme": "Theme name",
      "description": "What unites papers under this theme",
      "papers_involved": ["Paper title 1", "Paper title 2"],
      "significance": "Why this theme matters for the field"
    }}
  ],

  "method_comparison": {{
    "summary": "How methodological approaches relate and differ across papers",
    "approaches": [
      {{
        "approach": "Approach name or family",
        "papers": ["Paper using it"],
        "strengths": "What this approach does well",
        "weaknesses": "Where it falls short"
      }}
    ],
    "dominant_approach": "Which approach appears most effective and why"
  }},

  "dataset_comparison": {{
    "summary": "How dataset choices vary and what that implies",
    "datasets": [
      {{
        "name": "Dataset name",
        "used_by": ["Paper title"],
        "coverage": "What domain/task it covers",
        "limitations": "What it does not cover"
      }}
    ],
    "coverage_gaps": ["Dataset domain or type that NO paper covers"]
  }},

  "evaluation_comparison": {{
    "consistent_metrics": ["Metric used by most papers"],
    "inconsistent_metrics": ["Metric used by only some — note which"],
    "missing_evaluations": ["Important evaluation type absent from all papers"],
    "benchmark_gaps": ["Standard benchmark not used by any paper"]
  }},

  "areas_of_agreement": [
    "Specific finding or conclusion that multiple papers reach independently"
  ],

  "areas_of_disagreement": [
    {{
      "point": "The contested claim or finding",
      "paper_a": "Paper and its position",
      "paper_b": "Contrasting paper and its position",
      "implication": "What this disagreement means for the field"
    }}
  ],

  "research_trends": [
    {{
      "trend": "Trend name",
      "evidence": "Which papers and findings support this trend",
      "trajectory": "Where this trend is heading"
    }}
  ],

  "recurring_limitations": [
    {{
      "limitation": "The limitation",
      "appears_in": ["Paper titles"],
      "impact": "Why this recurring limitation matters"
    }}
  ],

  "recurring_research_gaps": [
    {{
      "gap": "The gap",
      "evidence": "How multiple papers reveal this gap (even if none state it explicitly)",
      "priority": "high / medium / low"
    }}
  ],

  "future_research_opportunities": [
    {{
      "opportunity": "Specific, actionable research direction",
      "rationale": "Which gaps, limitations, or disagreements motivate this",
      "novelty": "Why no existing paper addresses this"
    }}
  ],

  "field_maturity_assessment": "One paragraph assessing how mature this research area is: what is solved, what is actively contested, and what remains unexplored.",

  "keywords": [{{"term": "term", "score": 9}}],

  "datasets": ["Dataset name"],
  "evaluation_metrics": ["Metric"],
  "methods": ["Method or approach name"]
}}

RULES:
- synthesis_summary must NOT read as a list of paper summaries. It must be analytical prose.
- Every comparison must name specific papers.
- areas_of_disagreement requires at least one entry if papers have any conflicting findings.
- future_research_opportunities must trace back to specific evidence, not be generic.
- Do NOT write "Paper A proposes X. Paper B proposes Y." That is summarization, not synthesis.

Papers (with extracted analyses):
{papers_json[:10000]}"""


# ── Abstract-Only Analysis ────────────────────────────────────────────────────

def analyze_abstract_prompt(text: str) -> str:
    """
    Prompt optimised for short abstracts (~200-800 words).
    Unlike analyze_paper_prompt, this never expects full methodology sections,
    datasets tables, or evaluation results — instead it reasons inferentially
    from what the abstract does say, making evidence-based inferences about
    gaps and future scope rather than looking for explicit section text.
    """
    return f"""You are a research analyst extracting structured insights from a paper abstract.

This is an abstract only (not the full paper). Extract what IS stated and make
evidence-based inferences for everything else — trace every inference to a specific
claim or omission in the abstract.

Return ONLY a valid JSON object:

{{
  "executive_summary": "2-3 sentences: the problem, the approach, and the key result or claim, as stated in the abstract. Must include any specific numbers or comparisons mentioned.",

  "research_problem": "The exact problem this paper addresses, as stated or closely paraphrased from the abstract.",

  "motivation": "Why this problem matters, drawn from what the abstract says or clearly implies.",

  "research_gap": "The gap in prior work this paper claims to fill. Quote or paraphrase the contrast the authors draw with existing approaches.",

  "main_contribution": "The primary claimed contribution. Quote the abstract directly where possible.",

  "methodology": {{
    "overview": "The method or approach named in the abstract.",
    "key_components": ["Technical component mentioned in the abstract"],
    "novelty": "What the abstract claims is novel about this approach."
  }},

  "datasets": [
    {{
      "name": "Dataset name if mentioned, else 'Not specified in abstract'",
      "type": "public benchmark / proprietary / not specified",
      "size": "Size if mentioned, else 'not specified'",
      "domain": "Domain inferred from context"
    }}
  ],

  "evaluation": {{
    "metrics": ["Metric mentioned in abstract, e.g. accuracy, F1, BLEU — or 'not specified'"],
    "baselines": ["Comparison system mentioned — or 'not specified'"],
    "protocol": "Evaluation setup if stated, else 'not detailed in abstract'"
  }},

  "results_and_findings": [
    "Key result stated in the abstract. Include specific numbers if given (e.g., '94.3% accuracy, +2.1% over GPT-4'). If no numbers, state the qualitative claim."
  ],

  "strengths": [
    "Strength 1 — grounded in the abstract's own claims (e.g., 'Authors claim state-of-the-art on X benchmark')",
    "Strength 2 — apparent methodological advantage based on what is described"
  ],

  "weaknesses": [
    "Weakness 1 — what a reviewer would flag based on what the abstract does NOT mention (e.g., 'No mention of computational cost or scalability')",
    "Weakness 2 — potential scope limitation implied by the approach described"
  ],

  "limitations": [
    "Limitation 1 — explicitly stated in the abstract, OR inferred from the narrow scope of the claimed contribution. Explain your reasoning.",
    "Limitation 2 — implied by what the abstract does not claim to solve"
  ],

  "research_gaps": {{
    "from_limitations": ["Gap derived from what the paper explicitly does NOT address, as stated or implied by its scope"],
    "from_missing_datasets": ["Gap if the approach is tested on a narrow domain — what broader data is missing"],
    "from_missing_benchmarks": ["Gap from any evaluation type or benchmark not mentioned"],
    "from_generalization": ["Gap if the method is domain-specific — what generalization remains unproven"],
    "from_deployment": ["Gap between the claimed result and real-world deployment readiness"],
    "from_unsolved_problems": ["The fundamental problem that remains even after this contribution"]
  }},

  "future_scope": {{
    "author_suggested": ["Future direction explicitly stated in the abstract — or leave as empty list [] if none"],
    "ai_generated": [
      "Future direction 1: identify what the described approach cannot do → propose a concrete extension (explain the reasoning)",
      "Future direction 2: identify an adjacent domain or task where this approach has not been tested → explain why that matters",
      "Future direction 3: identify a limitation implied by the abstract → propose research that would address it"
    ]
  }},

  "key_takeaways": [
    "The single most important finding or claim from this abstract",
    "Second most important insight"
  ],

  "keywords": [
    {{"term": "specific technical term from abstract", "score": 9}},
    {{"term": "method, model, or framework name", "score": 8}},
    {{"term": "domain-specific concept", "score": 7}}
  ]
}}

RULES:
- Every field must be grounded in the abstract text or a clear inference from it.
- Never return empty arrays — always provide at least one item with evidence-based reasoning.
- research_gaps must each cite what in the abstract reveals the gap (stated scope, missing comparisons, etc.).
- ai_generated future scope must explain the reasoning chain: "Because the abstract states X, extending to Y would..."
- Do NOT generate generic filler like "future work could explore more datasets" without specifics.
- keywords must be technical terms from the abstract, not stopwords.

Abstract:
{text[:3000]}"""


# ── Literature Review ──────────────────────────────────────────────────────────

def literature_review_prompt(papers_json: str, topic: str) -> str:
    return f"""You are a professor writing a formal academic literature review on:
"{topic}"

You have structured analyses of multiple papers. Write a rigorous literature review
that reads as a unified scholarly argument, not as a sequence of paper summaries.

WRITING PROTOCOL:
- Each section must advance an argument or reveal a pattern.
- Cite papers by author/year inline (e.g., "Smith et al. (2023) demonstrate...").
- Identify tensions, progressions, and unresolved questions across the field.
- The review must be useful to a researcher who wants to understand the field landscape.

Return ONLY a valid JSON object:

{{
  "introduction": "<h2>1. Introduction</h2><p>Establish the research domain, its significance, and the scope of this review. State what the review will reveal about the field. Must mention the number of papers reviewed and the time span covered.</p><p>Second paragraph: introduce the key themes the review will examine and why they matter.</p>",

  "background": "<h2>2. Background</h2><p>Describe the foundational concepts, prior work, and technical context a reader needs to understand the papers reviewed. Explain what existed before the papers in this review and what limitations motivated new research.</p><p>Second paragraph: describe the evolution of approaches in this domain up to the period covered by these papers.</p>",

  "thematic_analysis": "<h2>3. Thematic Analysis</h2><h3>3.1 [Theme 1 name]</h3><p>Synthesize what multiple papers contribute to this theme. Do not summarize papers sequentially. Reference at least 2 papers per theme.</p><h3>3.2 [Theme 2 name]</h3><p>...</p><h3>3.3 [Theme 3 name if applicable]</h3><p>...</p>",

  "methodology_comparison": "<h2>4. Methodology Comparison</h2><p>Compare methodological approaches across papers. What families of methods dominate? Where do approaches diverge? Which methods show the most promise and why? Reference specific papers.</p><p>Second paragraph: identify methodological limitations that appear consistently and what they imply for future work.</p>",

  "dataset_comparison": "<h2>5. Dataset & Evaluation Landscape</h2><p>Compare datasets used across papers. Which benchmarks appear repeatedly? What domains or data types are underrepresented? How do evaluation protocols differ across papers, and what does inconsistency in evaluation mean for comparing results?</p>",

  "research_trends": "<h2>6. Research Trends</h2><p>What trajectory does the field show across these papers? What has improved? What has stagnated? What new directions are emerging? Support every claim with evidence from specific papers.</p>",

  "conclusion_and_gaps": "<h2>7. Research Gaps, Limitations & Future Directions</h2><h3>7.1 Research Gaps</h3><ul><li>[Evidence-based gap 1 — cite which papers reveal it]</li><li>[Gap 2]</li><li>[Gap 3]</li></ul><h3>7.2 Common Limitations</h3><ul><li>[Recurring limitation with paper evidence]</li><li>[Limitation 2]</li></ul><h3>7.3 Future Research Directions</h3><ul><li>[Specific direction with rationale]</li><li>[Direction 2]</li><li>[Direction 3]</li></ul>",

  "conclusion": "<h2>8. Conclusion</h2><p>Summarize what this body of work collectively establishes about {topic}. State the field's current frontier. End with a forward-looking statement about the most important open problem.</p>",

  "themes": ["Theme 1", "Theme 2", "Theme 3"],
  "common_gaps": ["Evidence-based gap 1", "Gap 2", "Gap 3"],
  "common_limitations": ["Recurring limitation 1", "Limitation 2"],
  "future_suggestions": ["Specific future direction 1", "Direction 2", "Direction 3"],

  "summary_table": [
    {{
      "title": "Paper title",
      "authors": "Author et al. (year)",
      "research_problem": "The specific problem addressed",
      "contribution": "Main contribution",
      "methodology": "Methods used",
      "datasets": "Datasets used",
      "key_results": "Key quantitative or qualitative results",
      "limitations": "Main limitation",
      "url": ""
    }}
  ]
}}

RULES:
- Every section must advance understanding, not list facts.
- introduction and background must establish WHY these papers exist.
- thematic_analysis must NOT read as summaries. It must compare and synthesize.
- summary_table must include research_problem, datasets, key_results, and limitations columns.
- common_gaps must be evidence-based — trace each gap to specific papers or absences.
- future_suggestions must be specific and actionable, not generic ("more data", "larger models").

Papers (with structured analyses):
{papers_json[:9000]}"""
