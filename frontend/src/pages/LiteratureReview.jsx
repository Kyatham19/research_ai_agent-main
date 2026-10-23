/**
 * LiteratureReview.jsx
 * 3-phase builder:
 *   Phase 1 — Pick workspaces from previous searches
 *   Phase 2 — Drag papers from Available → Review Builder, generate
 *   Phase 3 — Tabbed review editor + PDF/Word export
 *
 * Requires: @dnd-kit/core  @dnd-kit/sortable  @dnd-kit/utilities
 */
import { useState, useCallback, useRef, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { API, authFetch } from "../utils/api";

// ─── Drag-and-drop paper card (sortable in builder, draggable from pool) ────

function PaperCard({ paper, id, inBuilder, onRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`lr2-card${inBuilder ? " lr2-card--builder" : ""}`}
      {...attributes}
    >
      <span className="lr2-card__drag" {...listeners}>⠿</span>
      <div className="lr2-card__body">
        <div className="lr2-card__title">
          {paper.title || paper.source || "Untitled paper"}
        </div>
        <div className="lr2-card__meta">
          {(paper.authors || []).slice(0, 2).join(", ")}
          {(paper.authors || []).length > 2 ? " et al." : ""}
          {paper.published ? ` · ${paper.published.slice(0, 4)}` : ""}
        </div>
      </div>
      {inBuilder && (
        <button className="lr2-card__remove" onClick={() => onRemove(id)}>
          ✕
        </button>
      )}
    </div>
  );
}

// Ghost card shown during drag
function GhostCard({ paper }) {
  return (
    <div className="lr2-card lr2-card--ghost">
      <span className="lr2-card__drag">⠿</span>
      <div className="lr2-card__body">
        <div className="lr2-card__title">
          {paper?.title || paper?.source || "Paper"}
        </div>
      </div>
    </div>
  );
}

// ─── Phase 1: Workspace & Paper Selector ───────────────────────────────────────

const SAMPLE_REVIEW_TOPICS = [
  "Transformer Architectures & Self-Attention",
  "Retrieval-Augmented Generation (RAG)",
  "Quantum Computing & Error Correction",
  "CRISPR-Cas9 Therapeutic Editing",
];

function WorkspacePicker({ onConfirm, currentResults }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [loadingPapers, setLoadingPapers] = useState(false);
  const [error, setError] = useState(null);

  // Direct topic search inside Literature Review
  const [newTopic, setNewTopic] = useState("");
  const [searchingTopic, setSearchingTopic] = useState(false);

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const fetchWorkspaces = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/api/workspaces`);
      const data = await res.json();
      setWorkspaces(Array.isArray(data) ? data : []);
    } catch {
      setError("Could not load previous searches. Make sure backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleConfirmSaved = async () => {
    if (!selected.length) return;
    setLoadingPapers(true);
    setError(null);
    try {
      const results = await Promise.all(
        selected.map((id) =>
          authFetch(`${API}/api/workspaces/${id}`).then((r) => r.json())
        )
      );
      const allPapers = results.flatMap((ws) => ws.papers || []);
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
      if (papers.length < 2) throw new Error("Fewer than 2 papers found. Try a broader topic.");
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
      <div className="lr2-phase__label">Step 1 — Choose Source Publications</div>
      <p className="lr2-phase__hint">
        Select papers from your recent search, enter any topic to retrieve fresh papers, or pick from saved workspaces.
      </p>

      {/* Option A: Fast-track using currently active search */}
      {activePapers && activePapers.length >= 2 && (
        <div className="active-session-card">
          <div className="session-card-left">
            <span className="session-badge">⚡ CURRENT SEARCH READY</span>
            <h4 className="session-title">
              {activeTopic ? `"${activeTopic}"` : "Active Research Workspace"}
            </h4>
            <p className="session-subtitle">
              {activePapers.length} papers already analyzed and ready for immediate synthesis
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
          <span>Search new topic for this review:</span>
        </div>
        <div className="new-topic-shell">
          <input
            className="new-topic-field"
            placeholder="e.g. Transformer Attention, Quantum Computing, Cancer Immunotherapy..."
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
            {searchingTopic ? "Searching Papers…" : "Fetch Papers ➔"}
          </button>
        </div>

        <div className="sample-review-topics">
          <span className="sample-topics-label">Quick topics:</span>
          {SAMPLE_REVIEW_TOPICS.map((topic) => (
            <button
              key={topic}
              type="button"
              className="sample-topic-pill"
              onClick={() => {
                setNewTopic(topic);
                handleSearchTopic(topic);
              }}
            >
              + {topic}
            </button>
          ))}
        </div>
      </div>

      <div className="lr2-section-divider">
        <span>Saved Research Searches</span>
      </div>

      {loading ? (
        <div className="lr2-empty">Loading saved workspaces…</div>
      ) : workspaces.length === 0 ? (
        <div className="lr2-empty">
          No saved searches found yet. Use the topic search box above to fetch papers!
        </div>
      ) : (
        <>
          <div className="lr2-ws-list">
            {workspaces.map((ws) => {
              const active = selected.includes(ws.id);
              return (
                <div
                  key={ws.id}
                  className={`lr2-ws-item${active ? " lr2-ws-item--active" : ""}`}
                  onClick={() => toggle(ws.id)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="lr2-ws-check">{active ? "✓" : "○"}</div>
                  <div className="lr2-ws-info">
                    <div className="lr2-ws-query">{ws.query}</div>
                    <div className="lr2-ws-meta">
                      {ws.paper_count || 0} papers · {ws.mode ? ws.mode.toUpperCase() : "TOPIC"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            className="lr2-btn lr2-btn--primary"
            style={{ marginTop: 16 }}
            onClick={handleConfirmSaved}
            disabled={!selected.length || loadingPapers}
          >
            {loadingPapers
              ? "Loading papers…"
              : `Load Papers from ${selected.length} Selected Search${selected.length !== 1 ? "es" : ""} ➔`}
          </button>
        </>
      )}

      {error && <div className="lr2-error" style={{ marginTop: 16 }}>{error}</div>}
    </div>
  );
}

// ─── Phase 2: Drag-and-Drop Builder ──────────────────────────────────────────

function BuilderPhase({ allPapers, onGenerate, generating, error }) {
  // Pool = papers not yet in builder (keyed by stable index in allPapers)
  const [builderIds, setBuilderIds] = useState([]); // ordered list of paper ids in builder
  const [activeId, setActiveId] = useState(null);

  const poolIds = allPapers
    .map((_, i) => String(i))
    .filter((id) => !builderIds.includes(id));

  const paperById = (id) => allPapers[Number(id)];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handleDragStart = ({ active }) => setActiveId(String(active.id));

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over) return;

    const activeStr = String(active.id);
    const overStr = String(over.id);

    const inPool = poolIds.includes(activeStr);
    const overBuilder =
      overStr === "builder-drop" || builderIds.includes(overStr);
    const overPool =
      overStr === "pool-drop" || poolIds.includes(overStr);

    // Pool → Builder
    if (inPool && overBuilder) {
      if (builderIds.length >= 10) return; // max 10
      setBuilderIds((prev) => {
        const insertAt = builderIds.indexOf(overStr);
        if (insertAt === -1) return [...prev, activeStr];
        const next = [...prev];
        next.splice(insertAt, 0, activeStr);
        return next;
      });
      return;
    }

    // Builder → reorder within builder
    if (builderIds.includes(activeStr) && builderIds.includes(overStr)) {
      setBuilderIds((prev) => {
        const oldIdx = prev.indexOf(activeStr);
        const newIdx = prev.indexOf(overStr);
        return arrayMove(prev, oldIdx, newIdx);
      });
      return;
    }

    // Builder → Pool (drag back out)
    if (builderIds.includes(activeStr) && overPool) {
      setBuilderIds((prev) => prev.filter((id) => id !== activeStr));
      return;
    }
  };

  const removeFromBuilder = useCallback(
    (id) => setBuilderIds((prev) => prev.filter((x) => x !== id)),
    []
  );

  const addToBuilder = (id) => {
    if (builderIds.length >= 10 || builderIds.includes(id)) return;
    setBuilderIds((prev) => [...prev, id]);
  };

  const canGenerate = builderIds.length >= 2;

  return (
    <div className="lr2-phase lr2-phase--builder">
      <div className="lr2-phase__label">Step 2 — Build your review</div>
      <p className="lr2-phase__hint">
        Drag papers into the <strong>Review Builder</strong>, or click{" "}
        <strong>+</strong>. Select 2–10 papers, then generate.
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="lr2-builder-layout">
          {/* ── Left: Available Papers ── */}
          <div className="lr2-col">
            <div className="lr2-col__head">
              Available Papers
              <span className="lr2-col__count">{poolIds.length}</span>
            </div>

            <SortableContext
              items={poolIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="lr2-drop-zone" id="pool-drop">
                {poolIds.length === 0 && (
                  <div className="lr2-empty lr2-empty--sm">
                    All papers are in the builder.
                  </div>
                )}
                {poolIds.map((id) => (
                  <div key={id} className="lr2-pool-row">
                    <PaperCard
                      id={id}
                      paper={paperById(id)}
                      inBuilder={false}
                    />
                    <button
                      className="lr2-add-btn"
                      onClick={() => addToBuilder(id)}
                      title="Add to builder"
                      disabled={builderIds.length >= 10}
                    >
                      →
                    </button>
                  </div>
                ))}
              </div>
            </SortableContext>
          </div>

          {/* ── Arrow ── */}
          <div className="lr2-arrow">→</div>

          {/* ── Right: Review Builder ── */}
          <div className="lr2-col lr2-col--builder">
            <div className="lr2-col__head">
              Review Builder
              <span className="lr2-col__count">
                {builderIds.length} / 10
              </span>
            </div>

            <SortableContext
              items={builderIds}
              strategy={verticalListSortingStrategy}
            >
              <div
                className={`lr2-drop-zone lr2-drop-zone--builder${
                  builderIds.length === 0 ? " lr2-drop-zone--empty" : ""
                }`}
                id="builder-drop"
              >
                {builderIds.length === 0 && (
                  <div className="lr2-drop-hint">
                    ← Drag papers here
                  </div>
                )}
                {builderIds.map((id) => (
                  <PaperCard
                    key={id}
                    id={id}
                    paper={paperById(id)}
                    inBuilder
                    onRemove={removeFromBuilder}
                  />
                ))}
              </div>
            </SortableContext>

            <button
              className="lr2-btn lr2-btn--primary lr2-btn--full"
              style={{ marginTop: 14 }}
              disabled={!canGenerate || generating}
              onClick={() =>
                onGenerate(builderIds.map((id) => paperById(id)))
              }
            >
              {generating ? (
                <>
                  <span className="lr2-spinner" /> Generating…
                </>
              ) : (
                `✨ Generate Review (${builderIds.length} paper${
                  builderIds.length !== 1 ? "s" : ""
                })`
              )}
            </button>

            {!canGenerate && builderIds.length > 0 && (
              <div className="lr2-hint-text">Add at least 2 papers</div>
            )}
          </div>
        </div>

        <DragOverlay>
          {activeId ? <GhostCard paper={paperById(activeId)} /> : null}
        </DragOverlay>
      </DndContext>

      {error && <div className="lr2-error" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  );
}

// ─── Phase 3: Review Display + Editor ────────────────────────────────────────

const TABS = [
  { id: "intro",      label: "1. Introduction",      key: "introduction" },
  { id: "thematic",   label: "2. Thematic Analysis", key: "thematic_analysis" },
  { id: "table",      label: "3. Summary Table",     key: null },
  { id: "trajectory", label: "4. Trajectory",        key: "research_trajectory" },
  { id: "conclusion", label: "5. Conclusion & Gaps", key: "conclusion_and_gaps" },
];

// ContentEditable section that doesn't fight React reconciliation.
// Uses a ref to set innerHTML only on initial mount or tab change,
// never during typing — so the cursor stays stable.
function EditableSection({ htmlContent, onChange }) {
  const ref = useRef(null);
  const committedRef = useRef(null);

  useEffect(() => {
    if (ref.current && htmlContent !== committedRef.current) {
      ref.current.innerHTML = htmlContent || "";
      committedRef.current = htmlContent;
    }
  }, [htmlContent]);

  return (
    <div
      ref={ref}
      className="lr-editable"
      contentEditable
      suppressContentEditableWarning
      onInput={() => {
        const html = ref.current.innerHTML;
        committedRef.current = html;
        onChange(html);
      }}
    />
  );
}

// Single editable table cell — commits on blur to avoid mid-type re-renders.
function EditableCell({ value, onChange, isTitle, url }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.textContent = value || "";
  }, [value]);
  return (
    <td
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      className="lr-editable-cell"
      onBlur={() => onChange(ref.current.textContent)}
    />
  );
}

function ReviewDisplay({ review, topic, onReset }) {
  const [activeTab, setActiveTab] = useState("intro");
  const [editedSections, setEditedSections] = useState({});
  const [tableData, setTableData] = useState(() =>
    (review?.summary_table || []).map((r) => ({ ...r }))
  );

  const getSection = (key) =>
    editedSections[key] !== undefined
      ? editedSections[key]
      : review?.[key] || "";

  const setSection = (key, val) =>
    setEditedSections((prev) => ({ ...prev, [key]: val }));

  const updateCell = (rowIdx, field, value) =>
    setTableData((prev) =>
      prev.map((row, i) => (i === rowIdx ? { ...row, [field]: value } : row))
    );

  const buildTableHTML = () => {
    if (!tableData.length) return "";
    return `
      <table>
        <thead><tr>
          <th>Paper</th><th>Authors</th>
          <th>Key Contribution</th><th>Methodology</th><th>Key Findings</th>
        </tr></thead>
        <tbody>
          ${tableData
            .map(
              (row) => `
            <tr>
              <td><strong>${row.title}</strong></td>
              <td>${row.authors}</td>
              <td>${row.contribution}</td>
              <td>${row.methodology}</td>
              <td>${row.findings}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    `;
  };

  const buildFullHTML = () => `
    ${getSection("introduction")}
    ${getSection("thematic_analysis")}
    <h2>3. Summary Table</h2>${buildTableHTML()}
    ${getSection("research_trajectory")}
    ${getSection("conclusion_and_gaps")}
  `;

  const exportPDF = () => {
    const content = buildFullHTML();
    const win = window.open("", "_blank");
    win.document.write(`
      <html><head><title>Literature Review — ${topic}</title>
      <style>
        body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; line-height: 1.8; color: #1a1a1a; }
        h1 { font-size: 24px; } h2 { font-size: 18px; margin-top: 32px; border-bottom: 1px solid #ccc; }
        p { margin: 12px 0; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; }
        th { background: #f0f0f0; padding: 8px; border: 1px solid #ccc; }
        td { padding: 8px; border: 1px solid #ddd; vertical-align: top; }
        @media print { body { margin: 20px; } }
      </style></head><body>
      <h1>Literature Review: ${topic}</h1>
      <p style="color:#666;font-size:13px">
        Generated by ResearchAI · ${new Date().toLocaleDateString()} · ${review.paper_count} papers reviewed
      </p>
      ${content}
      </body></html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  const exportWord = () => {
    const content = buildFullHTML();
    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:w="urn:schemas-microsoft-com:office:word">
      <head><meta charset="utf-8">
      <style>
        body { font-family: Calibri, sans-serif; font-size: 12pt; }
        h1 { font-size: 18pt; } h2 { font-size: 14pt; }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid #ccc; padding: 6pt; font-size: 10pt; }
        th { background: #f0f0f0; font-weight: bold; }
      </style></head>
      <body>
        <h1>Literature Review: ${topic}</h1>
        <p style="color:#666">Generated by ResearchAI · ${new Date().toLocaleDateString()}</p>
        ${content}
      </body></html>
    `;
    const blob = new Blob([html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `literature-review-${(topic || "review")
      .replace(/\s+/g, "-")
      .toLowerCase()}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="lr2-review">
      <div className="lr2-review__toolbar">
        <div className="lr2-review__meta">
          <strong>{review.paper_count} papers</strong> reviewed
          {review.topic ? ` · ${review.topic}` : ""}
          {(review.themes || []).length > 0 &&
            ` · Themes: ${review.themes.slice(0, 3).join(", ")}`}
        </div>
        <div className="lr2-review__actions">
          <button className="lr2-btn lr2-btn--outline" onClick={onReset}>
            ← New Review
          </button>
          <button className="lr2-btn lr2-btn--export" onClick={exportPDF}>
            ⬇ PDF
          </button>
          <button className="lr2-btn lr2-btn--export" onClick={exportWord}>
            ⬇ Word
          </button>
        </div>
      </div>

      <div className="lr-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`lr-tab${activeTab === tab.id ? " active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="lr-content">
        {activeTab === "table" ? (
          <div className="lr-table-wrap">
            <div className="lr-section-label">Summary Table · Click any cell to edit</div>
            <div className="lr-table-scroll">
              <table className="lr-summary-table">
                <thead>
                  <tr>
                    <th>Paper Title</th>
                    <th>Authors</th>
                    <th>Key Contribution</th>
                    <th>Methodology</th>
                    <th>Key Findings</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row, i) => (
                    <tr key={i}>
                      <EditableCell value={row.title}        onChange={(v) => updateCell(i, "title", v)} />
                      <EditableCell value={row.authors}      onChange={(v) => updateCell(i, "authors", v)} />
                      <EditableCell value={row.contribution} onChange={(v) => updateCell(i, "contribution", v)} />
                      <EditableCell value={row.methodology}  onChange={(v) => updateCell(i, "methodology", v)} />
                      <EditableCell value={row.findings}     onChange={(v) => updateCell(i, "findings", v)} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
            <div className="lr-section-label">
              Click anywhere to edit · Changes export automatically
            </div>
            <EditableSection
              key={activeTab}
              htmlContent={getSection(TABS.find((t) => t.id === activeTab)?.key)}
              onChange={(val) => setSection(TABS.find((t) => t.id === activeTab)?.key, val)}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Root export ─────────────────────────────────────────────────────────────

export default function LiteratureReview({ onBack, results }) {
  // Phase: "pick" | "build" | "review"
  const [phase, setPhase] = useState("pick");
  const [allPapers, setAllPapers] = useState([]);
  const [review, setReview] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [topic, setTopic] = useState("");

  const handleWorkspacesConfirmed = (papers, topicName) => {
    setAllPapers(papers);
    if (topicName) setTopic(topicName);
    setPhase("build");
  };

  const handleGenerate = async (selectedPapers) => {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await authFetch(`${API}/api/literature-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ papers: selectedPapers, topic }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error || "Generation failed.");
        return;
      }
      setReview(data);
      setTopic(data.topic || topic);
      setPhase("review");
    } catch {
      setGenError("Cannot connect to backend.");
    } finally {
      setGenerating(false);
    }
  };

  const handleReset = () => {
    setPhase("pick");
    setAllPapers([]);
    setReview(null);
    setGenError(null);
    setTopic("");
  };

  return (
    <div className="lr2-wrap">
      {/* Header */}
      <div className="lr2-header">
        <button className="lr2-btn lr2-btn--ghost" onClick={onBack}>
          ← Back
        </button>
        <h2 className="lr2-title">📚 Literature Review Builder</h2>

        {/* Phase breadcrumb */}
        <div className="lr2-breadcrumb">
          {["pick", "build", "review"].map((p, i) => (
            <span
              key={p}
              className={`lr2-crumb${phase === p ? " lr2-crumb--active" : ""}${
                ["pick", "build", "review"].indexOf(phase) > i
                  ? " lr2-crumb--done"
                  : ""
              }`}
            >
              {i + 1}. {p === "pick" ? "Select searches" : p === "build" ? "Stage papers" : "Review"}
            </span>
          ))}
        </div>
      </div>

      {/* Phase content */}
      <div className="lr2-body">
        {phase === "pick" && (
          <WorkspacePicker
            onConfirm={handleWorkspacesConfirmed}
            currentResults={results}
          />
        )}

        {phase === "build" && (
          <>
            <div className="lr2-topic-row">
              <label className="lr2-label">Review topic (optional)</label>
              <input
                className="lr2-input"
                type="text"
                placeholder="e.g. transformer architectures in NLP"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
            <BuilderPhase
              allPapers={allPapers}
              onGenerate={handleGenerate}
              generating={generating}
              error={genError}
            />
          </>
        )}

        {phase === "review" && review && (
          <ReviewDisplay
            review={review}
            topic={topic}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  );
}
