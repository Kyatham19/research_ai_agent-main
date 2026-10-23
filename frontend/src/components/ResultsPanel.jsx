import { useState } from "react";

function Section({ icon, title, color, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section-card">
      <div className="section-head" onClick={() => setOpen(!open)}>
        <div className="section-icon" style={{ background: `${color}18`, color }}>{icon}</div>
        <h3>{title}</h3>
        <span className={`section-toggle${open ? " open" : ""}`}>▼</span>
      </div>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

function SingleAnalysis({ data }) {
  const stats = data.stats || {};
  return (
    <>
      <div className="stats-strip">
        <div className="stat-card">
          <span className="stat-num">{(stats.word_count || 0).toLocaleString()}</span>
          <span className="stat-label">Words</span>
        </div>
        <div className="stat-card">
          <span className="stat-num">{stats.sentence_count || 0}</span>
          <span className="stat-label">Sentences</span>
        </div>
        <div className="stat-card">
          <span className="stat-num">{stats.unique_words || 0}</span>
          <span className="stat-label">Unique words</span>
        </div>
        <div className="stat-card">
          <span className="stat-num">{stats.avg_sentence_length || 0}</span>
          <span className="stat-label">Avg sent. len</span>
        </div>
      </div>

      <Section icon="📋" title="Summary" color="#7c6aff">
        <p className="summary-text">{data.summary || "No summary available."}</p>
      </Section>

      <Section icon="🔑" title="Keywords" color="#a594ff">
        <div className="keyword-cloud">
          {(data.keywords || []).map((kw, i) => (
            <span className="keyword-tag" key={i}>
              {kw.term}<span className="keyword-score">{kw.score}</span>
            </span>
          ))}
        </div>
      </Section>

      <Section icon="⚙️" title="Methods Detected" color="#2dd4bf" defaultOpen={false}>
        <div className="method-pills">
          {(data.methods || []).map((m, i) => (
            <span className="method-pill" key={i}>{m}</span>
          ))}
        </div>
      </Section>

      <Section icon="💡" title="Contributions" color="#4ade80" defaultOpen={false}>
        <ul className="result-list contributions">
          {(data.contributions || []).map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </Section>

      <Section icon="🔍" title="Research Gaps" color="#fbbf24" defaultOpen={false}>
        <ul className="result-list gaps">
          {(data.research_gaps || []).map((g, i) => <li key={i}>{g}</li>)}
        </ul>
      </Section>

      <Section icon="⚠️" title="Limitations" color="#f87171" defaultOpen={false}>
        <ul className="result-list limitations">
          {(data.limitations || []).map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      </Section>

      <Section icon="🚀" title="Future Scope" color="#38bdf8" defaultOpen={false}>
        <ul className="result-list future">
          {(data.future_scope || []).map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      </Section>

      <Section icon="⭐" title="Important Sentences" color="#e879f9" defaultOpen={false}>
        <ul className="result-list">
          {(data.important_sentences || []).map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      </Section>
    </>
  );
}

function ComparisonTable({ papers }) {
  return (
    <div className="comparison-wrap">
      <div className="comparison-table-scroll">
        <table className="comparison-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Title</th>
              <th>Authors</th>
              <th>Published</th>
              <th>Top Keywords</th>
              <th>Methods</th>
              <th>Has Gaps?</th>
              <th>Has Limitations?</th>
              <th>Future Scope?</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {papers.map((p, i) => {
              const hasGaps = !(p.research_gaps?.[0] || "").includes("No explicit");
              const hasLimits = !(p.limitations?.[0] || "").includes("No explicit");
              const hasFuture = !(p.future_scope?.[0] || "").includes("No explicit");
              return (
                <tr key={i}>
                  <td className="col-num">{i + 1}</td>
                  <td className="col-title">{p.title}</td>
                  <td className="col-authors">{(p.authors || []).slice(0, 2).join(", ")}{p.authors?.length > 2 ? " et al." : ""}</td>
                  <td className="col-date">{p.published}</td>
                  <td className="col-keywords">
                    <div className="mini-pills">
                      {(p.keywords || []).slice(0, 3).map((k, j) => (
                        <span className="mini-pill" key={j}>{k.term}</span>
                      ))}
                    </div>
                  </td>
                  <td className="col-methods">
                    <div className="mini-pills">
                      {(p.methods || []).slice(0, 2).map((m, j) => (
                        <span className="mini-pill teal" key={j}>{m}</span>
                      ))}
                    </div>
                  </td>
                  <td className="col-badge">{hasGaps ? <span className="badge yes">Yes</span> : <span className="badge no">No</span>}</td>
                  <td className="col-badge">{hasLimits ? <span className="badge warn">Yes</span> : <span className="badge no">No</span>}</td>
                  <td className="col-badge">{hasFuture ? <span className="badge future">Yes</span> : <span className="badge no">No</span>}</td>
                  <td className="col-link">
                    {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="paper-link">arXiv ↗</a>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TopicResults({ data }) {
  const [view, setView] = useState("combined");
  const combined = data.combined_analysis || {};
  const papers = data.individual_papers || [];

  return (
    <>
      <div className="mode-tabs" style={{ marginBottom: "1.5rem" }}>
        <button className={`mode-tab${view === "combined" ? " active" : ""}`} onClick={() => setView("combined")}>
          📊 <span>Combined Analysis</span>
        </button>
        <button className={`mode-tab${view === "compare" ? " active" : ""}`} onClick={() => setView("compare")}>
          🆚 <span>Compare Papers ({papers.length})</span>
        </button>
        <button className={`mode-tab${view === "papers" ? " active" : ""}`} onClick={() => setView("papers")}>
          📚 <span>Individual Papers</span>
        </button>
      </div>

      {view === "combined" && <SingleAnalysis data={combined} />}

      {view === "compare" && <ComparisonTable papers={papers} />}

      {view === "papers" && (
        <div className="papers-grid">
          {papers.map((p, i) => (
            <div className="paper-card" key={i}>
              <div className="paper-title">{p.title}</div>
              <div className="paper-meta">
                {p.authors?.slice(0, 3).join(", ")}{p.authors?.length > 3 ? " et al." : ""} · {p.published}
              </div>
              <div className="paper-summary">{p.summary}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {!(p.research_gaps?.[0] || "").includes("No explicit") && (
                  <span className="badge yes" style={{ fontSize: 11 }}>Has gaps</span>
                )}
                {!(p.limitations?.[0] || "").includes("No explicit") && (
                  <span className="badge warn" style={{ fontSize: 11 }}>Has limitations</span>
                )}
                {!(p.future_scope?.[0] || "").includes("No explicit") && (
                  <span className="badge future" style={{ fontSize: 11 }}>Future scope</span>
                )}
              </div>
              <div className="keyword-cloud" style={{ marginTop: 8 }}>
                {(p.keywords || []).slice(0, 5).map((kw, j) => (
                  <span className="keyword-tag" key={j} style={{ fontSize: 11 }}>{kw.term}</span>
                ))}
              </div>
              {p.url && <a className="paper-link" href={p.url} target="_blank" rel="noreferrer">View on arXiv ↗</a>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function ResultsPanel({ results, mode, onReset }) {
  const isTopic = mode === "topic";
  const title = results.topic
    ? `"${results.topic}"`
    : results.source || results.title || "Analysis complete";

  return (
    <div className="results-panel">
      <div className="results-header">
        <div className="results-title">
          <small>Analysis results</small>
          {title}
        </div>
        <button className="back-btn" onClick={onReset}>← New analysis</button>
      </div>
      {isTopic ? <TopicResults data={results} /> : <SingleAnalysis data={results} />}
    </div>
  );
}
