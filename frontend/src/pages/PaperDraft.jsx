/**
 * PaperDraft.jsx
 * 3-phase research paper drafting tool:
 *   Phase 1 — Pick workspaces / reference papers
 *   Phase 2 — Configure paper (title, question, methodology, contributions)
 *   Phase 3 — Editable draft with tabbed sections + PDF/Word export
 */
import { useState, useRef, useEffect } from "react";
import { API, authFetch } from "../utils/api";

// ─── Phase 1: Workspace Picker ────────────────────────────────────────────────

function WorkspacePicker({ onConfirm, currentResults }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState([]);
  const [loadingPapers, setLoadingPapers] = useState(false);
  const [error, setError]           = useState(null);

  // Direct topic search inside Paper Draft
  const [newTopic, setNewTopic] = useState("");
  const [searchingTopic, setSearchingTopic] = useState(false);

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const fetchWorkspaces = async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await authFetch(`${API}/api/workspaces`);
      const data = await res.json();
      setWorkspaces(Array.isArray(data) ? data : []);
    } catch {
      setError("Could not load searches. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleConfirm = async () => {
    if (!selected.length) return;
    setLoadingPapers(true);
    setError(null);
    try {
      const results = await Promise.all(
        selected.map((id) =>
          authFetch(`${API}/api/workspaces/${id}`).then((r) => r.json())
        )
      );
      // Merge paper metadata with their analyses
      const allPapers = results.flatMap((ws) => {
        const analyses = ws.analyses || [];
        return (ws.papers || []).map((p, i) => ({ ...p, ...(analyses[i] || {}) }));
      });
      if (!allPapers.length) {
        setError("No papers found in the selected searches.");
        setLoadingPapers(false);
        return;
      }
      onConfirm(allPapers);
    } catch {
      setError("Failed to load papers.");
    } finally {
      setLoadingPapers(false);
    }
  };

  const handleSearchTopic = async (topicStr) => {
    const q = (topicStr || newTopic).trim();
    if (!q) return;
    setSearchingTopic(true);
    setError(null);
    try {
      const wsRes = await authFetch(`${API}/api/workspaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const ws = await wsRes.json();
      const wid = ws.id || null;

      const res = await authFetch(`${API}/analyze/topic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: q, max_papers: 5, workspace_id: wid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed.");
      const papers = data.individual_papers || data.papers || [];
      if (papers.length < 1) throw new Error("No papers found. Try a broader topic.");
      onConfirm(papers, q);
    } catch (err) {
      setError(err.message || "Failed to search topic.");
    } finally {
      setSearchingTopic(false);
    }
  };

  // Check if active session already has papers
  const activePapers = currentResults?.individual_papers?.length
    ? currentResults.individual_papers
    : Array.isArray(currentResults?.papers)
    ? currentResults.papers
    : null;
  const activeTopic = currentResults?.topic || currentResults?.title || "";

  return (
    <div className="lr2-phase">
      <div className="lr2-phase__label">Step 1 — Select Reference Papers</div>
      <p className="lr2-phase__hint">
        Choose papers to cite and synthesize in your research manuscript draft.
      </p>

      {/* Option A: Fast-track using currently active search */}
      {activePapers && activePapers.length > 0 && (
        <div className="active-session-card">
          <div className="session-card-left">
            <span className="session-badge">⚡ CURRENT SEARCH READY</span>
            <h4 className="session-title">
              {activeTopic ? `"${activeTopic}"` : "Active Research Workspace"}
            </h4>
            <p className="session-subtitle">
              {activePapers.length} papers already analyzed and ready as draft references
            </p>
          </div>
          <button
            type="button"
            className="btn-use-session"
            onClick={() => onConfirm(activePapers, activeTopic)}
          >
            <span>Use Current {activePapers.length} Papers ➔</span>
          </button>
        </div>
      )}

      {/* Option B: Direct Topic Search */}
      <div className="lr2-new-topic-card">
        <div className="new-topic-header">
          <span>Search new topic for references:</span>
        </div>
        <div className="new-topic-shell">
          <input
            className="new-topic-field"
            placeholder="e.g. LLM fine-tuning, CRISPR therapeutics, quantum optics..."
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearchTopic()}
          />
          <button
            type="button"
            className="btn-topic-search"
            onClick={() => handleSearchTopic()}
            disabled={searchingTopic || !newTopic.trim()}
          >
            {searchingTopic ? "Searching arXiv & PubMed…" : "Find Papers ➔"}
          </button>
        </div>
      </div>

      {/* Option C: Saved Workspaces */}
      <div style={{ marginTop: 24, marginBottom: 8, fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Or Pick From Previous Searches
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 0", color: "var(--text-muted)" }}>
          <div className="spinner" style={{ width: 18, height: 18 }} />
          <span>Loading your research workspaces…</span>
        </div>
      ) : (
        <>
          {workspaces.length > 0 && (
            <button
              className="lr2-btn lr2-btn--primary"
              style={{ marginBottom: 16 }}
              onClick={handleConfirm}
              disabled={!selected.length || loadingPapers}
            >
              {loadingPapers
                ? "Loading papers…"
                : `Continue with ${selected.length} Search${selected.length > 1 ? "es" : ""}`}
            </button>
          )}

          {workspaces.length === 0 ? (
            <div className="lr2-empty" style={{ padding: "16px 20px" }}>
              No previous searches saved yet. Use the search bar above or run a search from the home tab.
            </div>
          ) : (
            <div className="lr2-ws-list">
              {workspaces.map((ws) => {
                const active = selected.includes(ws.id);
                return (
                  <div
                    key={ws.id}
                    className={`lr2-ws-item${active ? " lr2-ws-item--active" : ""}`}
                    onClick={() => toggle(ws.id)}
                  >
                    <div className="lr2-ws-check">{active ? "☑" : "☐"}</div>
                    <div className="lr2-ws-info">
                      <div className="lr2-ws-query">{ws.query}</div>
                      <div className="lr2-ws-meta">{ws.paper_count || 0} papers</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {error && <div className="lr2-error">{error}</div>}
    </div>
  );
}

// ─── Phase 2: Paper Setup Form ────────────────────────────────────────────────

const ALL_SECTIONS = [
  { id: "abstract",           label: "Abstract" },
  { id: "introduction",       label: "Introduction" },
  { id: "related_work",       label: "Related Work" },
  { id: "methodology",        label: "Methodology" },
  { id: "results_discussion", label: "Results & Discussion" },
  { id: "conclusion",         label: "Conclusion" },
  { id: "references",         label: "References" },
];

function PaperSetup({ papers, onGenerate, generating, error, initialTopic }) {
  const [title,            setTitle]            = useState(initialTopic ? `Advancements in ${initialTopic}` : "");
  const [researchQuestion, setResearchQuestion] = useState(initialTopic ? `What are the key advancements and challenges in ${initialTopic}?` : "");
  const [methodology,      setMethodology]      = useState("");
  const [contributions,    setContributions]    = useState("");
  const [targetVenue,      setTargetVenue]      = useState("");
  const [sections,         setSections]         = useState(ALL_SECTIONS.map((s) => s.id));

  const toggleSection = (id) =>
    setSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );

  const canGenerate = title.trim() && researchQuestion.trim() && sections.length >= 2;

  return (
    <div className="lr2-phase pd-phase">
      <div className="lr2-phase__label">Step 2 — Configure your paper</div>
      <p className="lr2-phase__hint">
        Fill in your paper details. AI will use your {papers.length} reference paper{papers.length !== 1 ? "s" : ""} to draft each section.
      </p>

      <div className="pd-form">
        <div className="pd-field">
          <label className="pd-label">Paper Title <span className="pd-required">*</span></label>
          <input
            className="pd-input"
            placeholder="e.g. A Novel Approach to Federated Learning for Medical Imaging"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="pd-field">
          <label className="pd-label">Research Question / Objective <span className="pd-required">*</span></label>
          <textarea
            className="pd-textarea"
            rows={3}
            placeholder="What problem are you solving? What is the main objective of this research?"
            value={researchQuestion}
            onChange={(e) => setResearchQuestion(e.target.value)}
          />
        </div>

        <div className="pd-field">
          <label className="pd-label">Proposed Methodology</label>
          <textarea
            className="pd-textarea"
            rows={3}
            placeholder="Describe your approach, algorithm, model architecture, or experimental setup…"
            value={methodology}
            onChange={(e) => setMethodology(e.target.value)}
          />
        </div>

        <div className="pd-field">
          <label className="pd-label">Key Contributions</label>
          <textarea
            className="pd-textarea"
            rows={3}
            placeholder="List your main contributions, one per line…"
            value={contributions}
            onChange={(e) => setContributions(e.target.value)}
          />
        </div>

        <div className="pd-field">
          <label className="pd-label">Target Venue / Journal <span className="pd-optional">(optional)</span></label>
          <input
            className="pd-input"
            placeholder="e.g. NeurIPS 2025, IEEE Transactions on Neural Networks…"
            value={targetVenue}
            onChange={(e) => setTargetVenue(e.target.value)}
          />
        </div>

        <div className="pd-field">
          <label className="pd-label">Sections to Generate</label>
          <div className="pd-sections">
            {ALL_SECTIONS.map((s) => (
              <label
                key={s.id}
                className={`pd-section-chip${sections.includes(s.id) ? " pd-section-chip--on" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={sections.includes(s.id)}
                  onChange={() => toggleSection(s.id)}
                  style={{ display: "none" }}
                />
                {sections.includes(s.id) ? "☑" : "☐"} {s.label}
              </label>
            ))}
          </div>
        </div>

        <button
          className="lr2-btn lr2-btn--primary lr2-btn--full"
          style={{ marginTop: 8 }}
          onClick={() =>
            canGenerate &&
            onGenerate({ title, researchQuestion, methodology, contributions, targetVenue, sections })
          }
          disabled={!canGenerate || generating}
        >
          {generating ? (
            <><span className="lr2-spinner" /> Drafting your paper…</>
          ) : (
            `✨ Generate Paper Draft (up to 2 references)`
          )}
        </button>

        {!canGenerate && (
          <div className="lr2-hint-text">Title and Research Question are required · Select at least 2 sections</div>
        )}
      </div>

      {error && <div className="lr2-error" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  );
}

// ─── Editable section (ref-based — no React reconciliation conflict) ──────────

function EditableSection({ htmlContent, onChange }) {
  const ref          = useRef(null);
  const committedRef = useRef(null);

  useEffect(() => {
    if (ref.current && htmlContent !== committedRef.current) {
      ref.current.innerHTML = htmlContent || "";
      committedRef.current  = htmlContent;
    }
  }, [htmlContent]);

  return (
    <div
      ref={ref}
      className="lr-editable"
      contentEditable
      suppressContentEditableWarning
      onInput={() => {
        const html        = ref.current.innerHTML;
        committedRef.current = html;
        onChange(html);
      }}
    />
  );
}

// ─── Phase 3: Draft Display + Editor ─────────────────────────────────────────

function DraftDisplay({ draft, onReset }) {
  const sectionTabs = ALL_SECTIONS.filter((s) => draft[s.id]);
  const [activeTab, setActiveTab] = useState(sectionTabs[0]?.id || "abstract");
  const [edits,     setEdits]     = useState({});

  const getSection = (id) =>
    edits[id] !== undefined ? edits[id] : draft[id] || "";

  const setSection = (id, val) =>
    setEdits((prev) => ({ ...prev, [id]: val }));

  const buildFullHTML = () =>
    sectionTabs.map((s) => {
      const content = getSection(s.id);
      return s.id === "abstract"
        ? `<h2>Abstract</h2>${content}`
        : content;
    }).join("\n");

  const exportPDF = () => {
    const win = window.open("", "_blank");
    win.document.write(`
      <html><head><title>${draft.title}</title>
      <style>
        body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; line-height: 1.8; color: #1a1a1a; }
        h1 { font-size: 22px; text-align: center; margin-bottom: 4px; }
        h2 { font-size: 16px; margin-top: 32px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
        h3 { font-size: 14px; margin: 14px 0 6px; }
        p  { margin: 10px 0; font-size: 13px; text-align: justify; }
        ul, ol { margin: 8px 0 8px 24px; } li { font-size: 13px; margin: 4px 0; }
        .meta { text-align: center; color: #666; font-size: 12px; margin-bottom: 32px; }
        @media print { body { margin: 20px; } }
      </style></head><body>
      <h1>${draft.title}</h1>
      <p class="meta">Generated by ResearchAI · ${new Date().toLocaleDateString()} · ${draft.paper_count} references</p>
      ${buildFullHTML()}
      </body></html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  const exportWord = () => {
    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:w="urn:schemas-microsoft-com:office:word">
      <head><meta charset="utf-8">
      <style>
        body { font-family: Calibri, sans-serif; font-size: 12pt; }
        h1 { font-size: 18pt; text-align: center; }
        h2 { font-size: 14pt; } h3 { font-size: 12pt; font-weight: bold; }
        p  { text-align: justify; }
        ol, ul { margin-left: 20pt; }
        li { font-size: 11pt; }
      </style></head>
      <body>
        <h1>${draft.title}</h1>
        <p style="text-align:center;color:#666;font-size:10pt">
          Generated by ResearchAI · ${new Date().toLocaleDateString()} · ${draft.paper_count} references
        </p>
        ${buildFullHTML()}
      </body></html>
    `;
    const blob = new Blob([html], { type: "application/msword" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${(draft.title || "paper-draft").replace(/\s+/g, "-").toLowerCase()}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="lr2-review">
      <div className="lr2-review__toolbar">
        <div className="lr2-review__meta">
          <strong>{draft.title}</strong>
          {draft.paper_count ? ` · ${draft.paper_count} references` : ""}
        </div>
        <div className="lr2-review__actions">
          <button className="lr2-btn lr2-btn--outline" onClick={onReset}>← New Draft</button>
          <button className="lr2-btn lr2-btn--export"  onClick={exportPDF}>⬇ PDF</button>
          <button className="lr2-btn lr2-btn--export"  onClick={exportWord}>⬇ Word</button>
        </div>
      </div>

      <div className="lr-tabs">
        {sectionTabs.map((s) => (
          <button
            key={s.id}
            className={`lr-tab${activeTab === s.id ? " active" : ""}`}
            onClick={() => setActiveTab(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="lr-content">
        <div className="lr-section-label">Click anywhere to edit · Changes export automatically</div>
        <EditableSection
          key={activeTab}
          htmlContent={getSection(activeTab)}
          onChange={(val) => setSection(activeTab, val)}
        />
      </div>
    </div>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────

export default function PaperDraft({ onBack, results }) {
  const [phase,        setPhase]        = useState("pick");
  const [allPapers,    setAllPapers]    = useState([]);
  const [draft,        setDraft]        = useState(null);
  const [generating,   setGenerating]   = useState(false);
  const [genError,     setGenError]     = useState(null);
  const [initialTopic, setInitialTopic] = useState("");

  const handlePapersConfirmed = (papers, topic) => {
    setAllPapers(papers);
    if (topic) setInitialTopic(topic);
    setPhase("setup");
  };

  const handleGenerate = async ({ title, researchQuestion, methodology, contributions, targetVenue, sections }) => {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await authFetch(`${API}/api/paper-draft`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          papers: allPapers,
          title,
          research_question: researchQuestion,
          methodology,
          contributions,
          target_venue: targetVenue,
          sections,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setGenError(data.error || "Generation failed."); return; }
      setDraft(data);
      setPhase("draft");
    } catch {
      setGenError("Cannot connect to backend.");
    } finally {
      setGenerating(false);
    }
  };

  const handleReset = () => {
    setPhase("pick");
    setAllPapers([]);
    setDraft(null);
    setGenError(null);
    setInitialTopic("");
  };

  const STEPS        = ["pick", "setup", "draft"];
  const STEP_LABELS  = ["1. Select papers", "2. Configure", "3. Draft"];

  return (
    <div className="lr2-wrap">
      <div className="lr2-header">
        <button className="lr2-btn lr2-btn--ghost" onClick={onBack}>← Back</button>
        <div className="lr2-header__title">
          <span className="lr2-header__icon">📝</span>
          <strong>Paper Draft Builder</strong>
        </div>
        <div className="lr2-breadcrumb">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`lr2-crumb${phase === s ? " lr2-crumb--active" : ""}${STEPS.indexOf(phase) > i ? " lr2-crumb--done" : ""}`}
            >
              {STEP_LABELS[i]}
            </span>
          ))}
        </div>
      </div>

      <div className="lr2-body">
        {phase === "pick" && (
          <WorkspacePicker
            onConfirm={handlePapersConfirmed}
            currentResults={results}
          />
        )}
        {phase === "setup" && (
          <PaperSetup
            papers={allPapers}
            onGenerate={handleGenerate}
            generating={generating}
            error={genError}
            initialTopic={initialTopic}
          />
        )}
        {phase === "draft" && draft && (
          <DraftDisplay draft={draft} onReset={handleReset} />
        )}
      </div>
    </div>
  );
}
