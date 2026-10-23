import React, { useState } from "react";

/* ── Minimalist Section Accordion ── */
function Section({ icon, title, count, children, defaultOpen = true, rawTextToCopy, accentTag }) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    if (rawTextToCopy) {
      navigator.clipboard.writeText(rawTextToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div className={`intel-section ${open ? "open" : "collapsed"}`}>
      <div className="intel-section-header" onClick={() => setOpen(!open)}>
        <div className="section-header-left">
          <span className="section-vector-icon">{icon}</span>
          <h3 className="section-title">{title}</h3>
          {accentTag && <span className={`section-accent-tag ${accentTag}`}>{accentTag}</span>}
          {count != null && <span className="section-counter">{count}</span>}
        </div>

        <div className="section-header-right">
          {rawTextToCopy && (
            <button
              className={`intel-copy-btn ${copied ? "copied" : ""}`}
              onClick={handleCopy}
              title="Copy section data to clipboard"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          )}
          <span className={`intel-chevron ${open ? "open" : ""}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
        </div>
      </div>

      {open && <div className="intel-section-body">{children}</div>}
    </div>
  );
}

function StatusBadge({ type, label }) {
  return <span className={`status-pill-badge status-${type}`}>{label}</span>;
}

const PLACEHOLDER_PATTERNS = ["no explicit", "no ", "not identified", "not available", "n/a"];

function isPlaceholder(s) {
  const sl = String(s).toLowerCase().trim();
  return PLACEHOLDER_PATTERNS.some((p) => sl.startsWith(p)) || sl.length < 15;
}

function cleanList(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter((s) => !isPlaceholder(s));
}

function hasMeaningful(arr) {
  return cleanList(arr).length > 0;
}

function EmptyDataNote({ label }) {
  return (
    <div className="empty-data-row">
      <span className="empty-dash">—</span>
      <span>No explicit {label} extracted from publication text</span>
    </div>
  );
}

/* ── Primary Analysis Grid & Metrics ── */
function SingleAnalysis({ data }) {
  const s = data.stats || {};
  const gaps = cleanList(data.research_gaps_flat);
  const limitations = cleanList(data.limitations);
  const futureScope = cleanList(data.future_scope_flat);
  const contributions = cleanList(data.contributions);
  const keySentences = cleanList(data.important_sentences);
  const methods = (data.methods || []).filter((m) => m && m !== "No specific methods detected");

  const sourceUrl =
    (data.url && data.url.startsWith("http"))
      ? data.url
      : (data.source && data.source.startsWith("http"))
      ? data.source
      : null;

  return (
    <div className="analysis-board">
      {/* Primary Source Document Banner */}
      {(sourceUrl || data.source) && (
        <div className="paper-source-card">
          <div className="source-card-left">
            <span className="source-card-icon">🔗</span>
            <div className="source-card-text">
              <span className="source-card-label">Original Publication Source</span>
              <span className="source-card-url">{sourceUrl || data.source}</span>
            </div>
          </div>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-open-source-link"
            >
              <span>Read Full Paper ↗</span>
            </a>
          )}
        </div>
      )}

      {/* Precision KPI Panel */}
      <div className="kpi-panel">
        <div className="kpi-cell">
          <div className="kpi-meta">
            <span className="kpi-label">Corpus Volume</span>
            <span className="kpi-sub">Total tokens analyzed</span>
          </div>
          <div className="kpi-figure">{(s.word_count || 0).toLocaleString()} <span className="kpi-unit">words</span></div>
        </div>

        <div className="kpi-cell">
          <div className="kpi-meta">
            <span className="kpi-label">Syntactic Breadth</span>
            <span className="kpi-sub">Total sentence units</span>
          </div>
          <div className="kpi-figure">{(s.sentence_count || 0).toLocaleString()} <span className="kpi-unit">sentences</span></div>
        </div>

        <div className="kpi-cell">
          <div className="kpi-meta">
            <span className="kpi-label">Vocabulary Density</span>
            <span className="kpi-sub">Unique lexical roots</span>
          </div>
          <div className="kpi-figure">{(s.unique_words || 0).toLocaleString()} <span className="kpi-unit">unique</span></div>
        </div>

        <div className="kpi-cell">
          <div className="kpi-meta">
            <span className="kpi-label">Mean Sentence Length</span>
            <span className="kpi-sub">Words per structural clause</span>
          </div>
          <div className="kpi-figure">{s.avg_sentence_length || 0} <span className="kpi-unit">w/sent</span></div>
        </div>
      </div>

      {/* Grid of Analytical Breakdowns */}
      <div className="intel-grid">
        {/* Executive Summary */}
        <div className="grid-span-full">
          <Section
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
            }
            title="Executive Literature Synthesis"
            count={null}
            rawTextToCopy={data.summary}
          >
            <p className="academic-prose">{data.summary || "No executive summary available for this item."}</p>
          </Section>
        </div>

        {/* Salient Concepts & Keywords */}
        <Section
          icon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
              <line x1="7" y1="7" x2="7.01" y2="7"></line>
            </svg>
          }
          title="Salient Domain Entities & Keywords"
          count={(data.keywords || []).length}
          rawTextToCopy={(data.keywords || []).map((k) => `${k.term} (${k.score})`).join(", ")}
        >
          <div className="entity-cloud">
            {(data.keywords || []).map((kw, i) => (
              <span className="entity-chip" key={i}>
                <span className="entity-name">{kw.term}</span>
                {kw.score != null && <span className="entity-weight">{kw.score}</span>}
              </span>
            ))}
          </div>
        </Section>

        {/* Methodologies & Pipeline */}
        <Section
          icon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
              <rect x="9" y="9" width="6" height="6"></rect>
              <line x1="9" y1="1" x2="9" y2="4"></line>
              <line x1="15" y1="1" x2="15" y2="4"></line>
              <line x1="9" y1="20" x2="9" y2="23"></line>
              <line x1="15" y1="20" x2="15" y2="23"></line>
            </svg>
          }
          title="Methodology & Architecture"
          count={methods.length}
          defaultOpen={true}
          rawTextToCopy={methods.join("\n")}
        >
          {methods.length > 0 ? (
            <div className="method-cluster">
              {methods.map((m, i) => (
                <div className="method-node" key={i}>
                  <span className="node-bullet">■</span>
                  <span className="node-text">{m}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyDataNote label="methodologies" />
          )}
        </Section>

        {/* Scientific Contributions */}
        {contributions.length > 0 && (
          <Section
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
            }
            title="Claimed Scientific Contributions"
            count={contributions.length}
            defaultOpen={true}
            rawTextToCopy={contributions.join("\n")}
            accentTag="contribution"
          >
            <ul className="claims-list">
              {contributions.map((c, i) => (
                <li key={i}>
                  <span className="claim-bullet">✦</span>
                  <span className="claim-body">{c}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Important Findings */}
        {keySentences.length > 0 && (
          <Section
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
            }
            title="Pivotal Empirical Assertions"
            count={keySentences.length}
            defaultOpen={false}
            rawTextToCopy={keySentences.join("\n")}
          >
            <div className="citations-block">
              {keySentences.map((s, i) => (
                <blockquote className="citation-quote" key={i}>
                  <span className="quote-index">[{i + 1}]</span>
                  <span>{s}</span>
                </blockquote>
              ))}
            </div>
          </Section>
        )}

        {/* Research Gaps */}
        <Section
          icon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          }
          title="Identified Research Gaps"
          count={gaps.length}
          defaultOpen={true}
          rawTextToCopy={gaps.join("\n")}
          accentTag="gap"
        >
          {gaps.length > 0 ? (
            <div className="findings-collection gaps">
              {gaps.map((g, i) => (
                <div className="finding-entry gap" key={i}>
                  <div className="entry-tag">GAP {i + 1}</div>
                  <div className="entry-content">{g}</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyDataNote label="research gaps" />
          )}
        </Section>

        {/* Limitations */}
        <Section
          icon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          }
          title="Methodological & Benchmark Limitations"
          count={limitations.length}
          defaultOpen={true}
          rawTextToCopy={limitations.join("\n")}
          accentTag="limitation"
        >
          {limitations.length > 0 ? (
            <div className="findings-collection limits">
              {limitations.map((l, i) => (
                <div className="finding-entry limit" key={i}>
                  <div className="entry-tag">LIMITATION {i + 1}</div>
                  <div className="entry-content">{l}</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyDataNote label="limitations" />
          )}
        </Section>

        {/* Future Scope */}
        <div className="grid-span-full">
          <Section
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
              </svg>
            }
            title="Hypotheses & Future Research Directions"
            count={futureScope.length}
            defaultOpen={true}
            rawTextToCopy={futureScope.join("\n")}
            accentTag="scope"
          >
            {futureScope.length > 0 ? (
              <div className="findings-collection future">
                {futureScope.map((f, i) => (
                  <div className="finding-entry scope" key={i}>
                    <div className="entry-tag">HORIZON {i + 1}</div>
                    <div className="entry-content">{f}</div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyDataNote label="future scope" />
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

/* ── Cross-Paper Comparative Table ── */
function CompareView({ papers }) {
  return (
    <div className="matrix-card">
      <div className="matrix-header">
        <div className="matrix-header-info">
          <h3 className="matrix-title">Cross-Publication Comparison Matrix</h3>
          <p className="matrix-caption">Multi-attribute decomposition of {papers.length} publications</p>
        </div>
      </div>

      <div className="matrix-table-scroll">
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="th-idx">#</th>
              <th className="th-title">Publication Title</th>
              <th>Lead Authors</th>
              <th>Year</th>
              <th>Core Taxonomy</th>
              <th>Methodology</th>
              <th className="th-center">Gaps</th>
              <th className="th-center">Limits</th>
              <th className="th-center">Future</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {papers.map((p, i) => (
              <tr key={i}>
                <td className="td-idx">{i + 1}</td>
                <td className="td-title">
                  <div className="paper-title-text">{p.title}</div>
                </td>
                <td className="td-authors">
                  {(p.authors || []).slice(0, 2).join(", ")}
                  {(p.authors || []).length > 2 ? " et al." : ""}
                </td>
                <td className="td-mono">{p.published ? p.published.slice(0, 4) : "—"}</td>
                <td>
                  <div className="table-tags">
                    {(p.keywords || []).slice(0, 3).map((k, j) => (
                      <span className="table-tag" key={j}>
                        {k.term}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <div className="table-tags">
                    {(p.methods || [])
                      .slice(0, 2)
                      .filter((m) => m !== "No specific methods detected")
                      .map((m, j) => (
                        <span className="table-tag method" key={j}>
                          {m}
                        </span>
                      ))}
                  </div>
                </td>
                <td className="td-center">
                  {hasMeaningful(p.research_gaps_flat) ? (
                    <StatusBadge type="positive" label="Identified" />
                  ) : (
                    <StatusBadge type="neutral" label="None" />
                  )}
                </td>
                <td className="td-center">
                  {hasMeaningful(p.limitations) ? (
                    <StatusBadge type="caution" label="Documented" />
                  ) : (
                    <StatusBadge type="neutral" label="None" />
                  )}
                </td>
                <td className="td-center">
                  {hasMeaningful(p.future_scope_flat) ? (
                    <StatusBadge type="info" label="Mapped" />
                  ) : (
                    <StatusBadge type="neutral" label="None" />
                  )}
                </td>
                <td>
                  {p.url ? (
                    <a className="table-link-btn" href={p.url} target="_blank" rel="noreferrer">
                      <span>Open Paper</span>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="7" y1="17" x2="17" y2="7"></line>
                        <polyline points="7 7 17 7 17 17"></polyline>
                      </svg>
                    </a>
                  ) : (
                    <span className="td-empty-text">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Individual Publications Grid ── */
function PapersView({ papers }) {
  const [expanded, setExpanded] = useState({});
  const toggle = (i) => setExpanded((p) => ({ ...p, [i]: !p[i] }));

  return (
    <div className="papers-ledger">
      {papers.map((p, i) => (
        <article className="paper-entry" key={i}>
          <div className="entry-header">
            <span className="entry-order">REF [{i + 1}]</span>
            <div className="entry-header-content">
              <h4 className="entry-title">{p.title}</h4>
              <div className="entry-byline">
                <span>{(p.authors || []).slice(0, 3).join(", ")}{(p.authors || []).length > 3 ? " et al." : ""}</span>
                <span className="byline-dot">·</span>
                <span>{p.published || "Publication Date Unstated"}</span>
              </div>
            </div>
          </div>

          <p className="entry-abstract">{p.summary}</p>

          <div className="entry-flags">
            {cleanList(p.research_gaps_flat).length > 0 && (
              <StatusBadge type="positive" label="Research Gaps" />
            )}
            {cleanList(p.limitations).length > 0 && (
              <StatusBadge type="caution" label="Limitations" />
            )}
            {cleanList(p.future_scope_flat).length > 0 && (
              <StatusBadge type="info" label="Future Scope" />
            )}
          </div>

          <div className="entry-keywords">
            {(p.keywords || []).slice(0, 6).map((kw, j) => (
              <span className="kw-badge" key={j}>
                {kw.term}
              </span>
            ))}
          </div>

          <div className="entry-actions-row">
            <button className="btn-expand-breakdown" onClick={() => toggle(i)}>
              <span>{expanded[i] ? "Collapse Analytical Decomposition" : "View Analytical Decomposition"}</span>
              <span className={`chevron-indicator ${expanded[i] ? "up" : "down"}`}>▼</span>
            </button>

            {p.url && (
              <a className="btn-external-arxiv" href={p.url} target="_blank" rel="noreferrer">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
                <span>Open Paper on arXiv ↗</span>
              </a>
            )}
          </div>

          {expanded[i] && (
            <div className="entry-drawer">
              <div className="drawer-columns">
                <div className="drawer-panel">
                  <div className="panel-label">Identified Gaps</div>
                  <div className="panel-list">
                    {cleanList(p.research_gaps_flat).length > 0 ? (
                      cleanList(p.research_gaps_flat).map((g, j) => (
                        <div className="panel-item" key={j}>{g}</div>
                      ))
                    ) : (
                      <EmptyDataNote label="gaps" />
                    )}
                  </div>
                </div>

                <div className="drawer-panel">
                  <div className="panel-label">Limitations</div>
                  <div className="panel-list">
                    {cleanList(p.limitations).length > 0 ? (
                      cleanList(p.limitations).map((l, j) => (
                        <div className="panel-item" key={j}>{l}</div>
                      ))
                    ) : (
                      <EmptyDataNote label="limitations" />
                    )}
                  </div>
                </div>

                <div className="drawer-panel">
                  <div className="panel-label">Future Scope</div>
                  <div className="panel-list">
                    {cleanList(p.future_scope_flat).length > 0 ? (
                      cleanList(p.future_scope_flat).map((f, j) => (
                        <div className="panel-item" key={j}>{f}</div>
                      ))
                    ) : (
                      <EmptyDataNote label="future scope" />
                    )}
                  </div>
                </div>

                <div className="drawer-panel">
                  <div className="panel-label">Methodology Nodes</div>
                  <div className="panel-list">
                    {(p.methods || [])
                      .filter((m) => m && m !== "No specific methods detected")
                      .map((m, j) => (
                        <div className="panel-item mono" key={j}>{m}</div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

/* ── Results Page Container ── */
export default function ResultsPage({ results, mode, workspaceId, onBack }) {
  const isTopic    = mode === "topic";
  const isMultiPDF = Array.isArray(results.papers);
  const isMulti    = isTopic || isMultiPDF;

  const papers   = isTopic ? (results.individual_papers || []) : (isMultiPDF ? results.papers : []);
  const combined = isTopic ? results.combined_analysis : (isMultiPDF ? results.combined : null);

  const VIEWS = isMulti
    ? [
        { id: "combined", label: "Integrated Synthesis" },
        { id: "compare",  label: "Comparative Matrix" },
        { id: "papers",   label: `Publications (${papers.length})` },
      ]
    : [];

  const [view, setView] = useState("combined");
  const [copiedAll, setCopiedAll] = useState(false);

  const title = results.topic ? `"${results.topic}"` : results.source || results.title || "Academic Analysis";

  const handleCopySummary = () => {
    const activeData = isMulti && view === "combined" ? (combined || results) : results;
    const textToCopy = `ResearchAI Literature Review: ${title}\n\nSynthesis:\n${activeData.summary || ""}\n\nResearch Gaps:\n${(activeData.research_gaps_flat || []).join("\n")}\n\nFuture Directions:\n${(activeData.future_scope_flat || []).join("\n")}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1800);
  };

  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(results, null, 2));
    const dlAnchor = document.createElement("a");
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `research-ai-${Date.now()}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  };

  const paperSourceUrl =
    (results.url && results.url.startsWith("http"))
      ? results.url
      : (results.source && results.source.startsWith("http"))
      ? results.source
      : null;

  return (
    <div className="results-stage">
      {/* Editorial Top Toolbar */}
      <div className="results-action-bar">
        <div className="action-bar-left">
          <div className="action-bar-meta">
            <span className="scope-tag">{isTopic ? "Topic Review" : isMultiPDF ? "Multi-PDF Ingestion" : `${mode.toUpperCase()} Analysis`}</span>
            <span className="scope-sep">/</span>
            <span className="scope-details">{papers.length ? `${papers.length} publications evaluated` : "Single Document"}</span>
          </div>
          <h2 className="action-bar-title">{title}</h2>
        </div>

        {isMulti && (
          <div className="view-mode-selector">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                className={`view-mode-pill ${view === v.id ? "active" : ""}`}
                onClick={() => setView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}

        <div className="action-bar-right">
          {paperSourceUrl && (
            <a
              href={paperSourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-header-link"
              title="Open the original publication in a new tab"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              <span>Open Paper Link ↗</span>
            </a>
          )}
          <button className="btn-utility" onClick={handleCopySummary}>
            {copiedAll ? "Copied" : "Copy Synthesis"}
          </button>
          <button className="btn-utility" onClick={handleExportJSON}>
            Export JSON
          </button>
          <button className="btn-primary-action" onClick={onBack}>
            ← New Research
          </button>
        </div>
      </div>

      {/* Main Results Viewport */}
      <div className="results-viewport">
        {!isMulti && <SingleAnalysis data={results} />}
        {isMulti && view === "combined" && <SingleAnalysis data={combined || results} />}
        {isMulti && view === "compare" && <CompareView papers={papers} />}
        {isMulti && view === "papers" && <PapersView papers={papers} />}
      </div>
    </div>
  );
}
