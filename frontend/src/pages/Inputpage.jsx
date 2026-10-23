/**
 * InputPage.jsx — User-Friendly Academic Research Assistant
 * Clear, intuitive, and accessible for everyone
 */
import { useState, useRef, useEffect } from "react";
import { API, authFetch } from "../utils/api";

const SAMPLE_TOPICS = [
  "Self-Attention & Transformer Models",
  "Retrieval-Augmented Generation (RAG)",
  "Quantum Computing & Error Correction",
  "CRISPR Gene Editing in Medicine",
  "Reinforcement Learning with Human Feedback (RLHF)",
];

const SAMPLE_LINKS = [
  {
    name: "Attention Is All You Need (Transformers)",
    url: "https://arxiv.org/abs/1706.03762",
  },
  {
    name: "BERT: Pre-training of Deep Bidirectional Transformers",
    url: "https://arxiv.org/abs/1810.04805",
  },
  {
    name: "Deep Residual Learning (ResNet)",
    url: "https://arxiv.org/abs/1512.03385",
  },
];

const SCANNING_STEPS = [
  { title: "Finding Relevant Papers", detail: "Searching across arXiv, PubMed, OpenAlex & Semantic Scholar..." },
  { title: "Extracting Paper Content", detail: "Reading abstracts, methodologies, formulas, and findings..." },
  { title: "Analyzing Research Gaps", detail: "Identifying limitations, unanswered questions, and future scope..." },
  { title: "Generating Summary", detail: "Synthesizing cross-paper insights and key contributions..." },
];

export default function InputPage({ mode, setMode, onResults, onError, loading, setLoading }) {
  const [topic, setTopic]         = useState("");
  const [maxPapers, setMaxPapers] = useState(5);
  const [url, setUrl]             = useState("");
  const [text, setText]           = useState("");
  const [files, setFiles]         = useState([]);
  const [dragging, setDragging]   = useState(false);
  const [scanIdx, setScanIdx]     = useState(0);
  const [elapsed, setElapsed]     = useState(0);
  const fileRef = useRef();

  useEffect(() => {
    let interval, timer;
    if (loading) {
      setScanIdx(0);
      setElapsed(0);
      interval = setInterval(() => {
        setScanIdx((prev) => (prev + 1) % SCANNING_STEPS.length);
      }, 3000);
      timer = setInterval(() => {
        setElapsed((s) => s + 1);
      }, 1000);
    }
    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [loading]);

  const addFiles = (newFiles) => {
    const pdfs = Array.from(newFiles).filter(f => f.name.endsWith(".pdf"));
    if (!pdfs.length) { onError("Please select a PDF file."); return; }
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...pdfs.filter(f => !names.has(f.name))];
    });
  };

  const createWorkspace = async (query) => {
    try {
      const res = await authFetch(`${API}/api/workspaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const ws = await res.json();
      return ws.id || null;
    } catch {
      return null;
    }
  };

  const isLikelyUrl = (s) => {
    const t = (s || "").trim().toLowerCase();
    return (
      t.startsWith("http://") ||
      t.startsWith("https://") ||
      t.startsWith("arxiv.org") ||
      t.startsWith("www.arxiv.org") ||
      t.startsWith("doi.org") ||
      t.startsWith("10.")
    );
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const clipText = await navigator.clipboard.readText();
        if (clipText && clipText.trim()) {
          setUrl(clipText.trim());
        }
      }
    } catch {
      // Clipboard read not permitted
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      let res, data, query = "", wid = null, effectiveMode = mode;

      if (mode === "topic") {
        if (!topic.trim()) { onError("Please enter a topic to search."); setLoading(false); return; }
        query = topic.trim();

        // Forgiving detection: If user pasted a paper link in topic search, analyze as URL seamlessly
        if (isLikelyUrl(query)) {
          effectiveMode = "url";
          let cleanUrl = query;
          if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
            cleanUrl = "https://" + cleanUrl;
          }
          setUrl(cleanUrl);
          setMode("url");
          wid = await createWorkspace(cleanUrl);
          res = await authFetch(`${API}/analyze/url`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: cleanUrl, workspace_id: wid }),
          });
        } else {
          wid = await createWorkspace(query);
          res = await authFetch(`${API}/analyze/topic`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic: query, max_papers: maxPapers, workspace_id: wid }),
          });
        }

      } else if (mode === "url") {
        if (!url.trim()) { onError("Please enter or paste a paper link."); setLoading(false); return; }
        query = url.trim();
        if (!query.startsWith("http://") && !query.startsWith("https://")) {
          query = "https://" + query;
        }
        wid   = await createWorkspace(query);
        res   = await authFetch(`${API}/analyze/url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: query, workspace_id: wid }),
        });

      } else if (mode === "pdf") {
        if (!files.length) { onError("Please select at least one PDF file."); setLoading(false); return; }
        query = files.map(f => f.name).join(", ");
        wid   = await createWorkspace(query);
        const form = new FormData();
        if (files.length === 1) {
          form.append("file", files[0]);
          if (wid) form.append("workspace_id", wid);
          res = await authFetch(`${API}/analyze/pdf`, { method: "POST", body: form });
        } else {
          files.forEach(f => form.append("files", f));
          if (wid) form.append("workspace_id", wid);
          res = await authFetch(`${API}/analyze/pdfs`, { method: "POST", body: form });
        }

      } else {
        if (!text.trim()) { onError("Please paste some paper text or an abstract."); setLoading(false); return; }
        query = text.slice(0, 60) + (text.length > 60 ? "..." : "");
        wid   = await createWorkspace(query);
        res   = await authFetch(`${API}/analyze/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.trim(), workspace_id: wid }),
        });
      }

      data = await res.json();
      if (!res.ok) { onError(data.error || "Analysis failed."); setLoading(false); return; }

      onResults({ ...data, _mode: effectiveMode }, wid);

    } catch (err) {
      console.error("Retrieval execution error:", err);
      onError(err?.message && !err.message.includes("Failed to fetch") ? err.message : "Cannot connect to backend server. Make sure Flask is running on port 5000.");
    }
    setLoading(false);
  };

  return (
    <main className="search-stage">
      <div className="search-ambient-matrix" />

      {/* Retrieval Console Header */}
      <div className="retrieval-header">
        <div className="retrieval-eyebrow">
          <span className="retrieval-indicator" />
          <span className="retrieval-eyebrow-text">PAPER RETRIEVAL CONSOLE</span>
        </div>

        <h1 className="retrieval-headline">
          Search, Extract & Ingest Research Papers
        </h1>

        <p className="retrieval-subheading">
          Retrieve publications across arXiv, PubMed & Semantic Scholar, paste direct paper links, or upload PDF manuscripts for automated multi-agent analysis.
        </p>
      </div>

      {/* Main Friendly Search Console */}
      <div className="search-console">
        {/* Clear, Easy-to-Understand Tabs */}
        <div className="console-modes">
          <button
            className={`console-tab ${mode === "topic" ? "active" : ""}`}
            onClick={() => setMode("topic")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <span className="tab-text">Search by Topic</span>
          </button>

          <button
            className={`console-tab ${mode === "url" ? "active" : ""}`}
            onClick={() => setMode("url")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            <span className="tab-text">Paste Paper Link / URL</span>
            <span className="tab-highlight-pill">arXiv & Web</span>
          </button>

          <button
            className={`console-tab ${mode === "pdf" ? "active" : ""}`}
            onClick={() => setMode("pdf")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            <span className="tab-text">Upload PDF Files</span>
          </button>

          <button
            className={`console-tab ${mode === "text" ? "active" : ""}`}
            onClick={() => setMode("text")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="2" x2="22" y2="6"></line>
              <path d="M7.5 20.5 19 9l-4-4L3.5 16.5 2 22z"></path>
            </svg>
            <span className="tab-text">Paste Text / Abstract</span>
          </button>
        </div>

        {/* Tab 1: Search by Topic */}
        {mode === "topic" && (
          <div className="console-body">
            <div className="tab-instruction">
              <strong>Enter any research topic or question:</strong>
            </div>

            <div className="command-input-shell">
              <span className="command-prefix">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </span>
              <input
                className="command-field"
                placeholder="e.g. Transformer Attention, Quantum Computing, Cancer Immunotherapy..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
              {topic && (
                <button className="command-clear" onClick={() => setTopic("")} title="Clear">
                  ✕
                </button>
              )}
              <button
                className="btn-execute"
                onClick={handleSubmit}
                disabled={loading || !topic.trim()}
              >
                <span>Search Papers</span>
                <span className="btn-kbd">➔</span>
              </button>
            </div>

            {/* Smart detection if user pasted link here */}
            {isLikelyUrl(topic) && (
              <div className="url-detected-callout">
                <span className="callout-icon">💡</span>
                <span className="callout-msg">Paper link detected! Antigravity AI will analyze this link directly.</span>
                <button
                  type="button"
                  className="btn-switch-tab-link"
                  onClick={() => {
                    setUrl(topic.trim());
                    setMode("url");
                  }}
                >
                  Switch to Link Mode ➔
                </button>
              </div>
            )}

            {/* Interactive Paper Depth Slider / Dragger */}
            <div className="depth-slider-card">
              <div className="depth-slider-header">
                <div className="depth-slider-label-group">
                  <span className="depth-slider-title">Papers to Retrieve & Analyze</span>
                  <span className="depth-slider-subtitle">
                    {maxPapers <= 3
                      ? "Fast Synthesis (Speed optimized)"
                      : maxPapers <= 7
                      ? "Standard Synthesis (Recommended)"
                      : maxPapers <= 10
                      ? "Deep Comparative Matrix"
                      : "Comprehensive Survey"}
                  </span>
                </div>
                <div className="depth-count-bubble">
                  <span className="count-number">{maxPapers}</span>
                  <span className="count-unit">{maxPapers === 1 ? "Paper" : "Papers"}</span>
                </div>
              </div>

              <div className="depth-slider-track-shell">
                <button
                  type="button"
                  className="slider-step-btn"
                  onClick={() => setMaxPapers((p) => Math.max(1, p - 1))}
                  disabled={maxPapers <= 1}
                  title="Decrease papers"
                >
                  −
                </button>
                <div className="slider-input-wrapper">
                  <input
                    type="range"
                    min="1"
                    max="15"
                    step="1"
                    value={maxPapers}
                    onChange={(e) => setMaxPapers(Number(e.target.value))}
                    className="paper-range-dragger"
                    style={{
                      background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${((maxPapers - 1) / 14) * 100}%, var(--border-medium) ${((maxPapers - 1) / 14) * 100}%, var(--border-medium) 100%)`
                    }}
                    aria-label="Number of papers to analyze"
                  />
                  <div className="slider-ticks-row">
                    <span onClick={() => setMaxPapers(1)}>1</span>
                    <span onClick={() => setMaxPapers(3)}>3</span>
                    <span onClick={() => setMaxPapers(5)}>5</span>
                    <span onClick={() => setMaxPapers(8)}>8</span>
                    <span onClick={() => setMaxPapers(10)}>10</span>
                    <span onClick={() => setMaxPapers(15)}>15</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="slider-step-btn"
                  onClick={() => setMaxPapers((p) => Math.min(15, p + 1))}
                  disabled={maxPapers >= 15}
                  title="Increase papers"
                >
                  +
                </button>
              </div>
            </div>

            {/* One-Click Example Topics */}
            <div className="suggested-queries">
              <span className="suggested-label">Try an example topic:</span>
              <div className="suggested-list">
                {SAMPLE_TOPICS.map((item) => (
                  <button
                    key={item}
                    className="suggested-pill"
                    onClick={() => setTopic(item)}
                  >
                    + {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Paste Paper Link / URL */}
        {mode === "url" && (
          <div className="console-body">
            <div className="tab-instruction">
              <div className="instruction-header-row">
                <span className="mode-accent-badge">🔗 DIRECT PAPER LINK</span>
                <strong>Paste any arXiv paper link or academic web URL:</strong>
              </div>
              <span className="tab-instruction-sub">
                Our AI fetches the full paper, reads the methodology, and extracts key findings, limitations, and future research gaps.
              </span>
            </div>

            <div className="command-input-shell url-mode-shell">
              <span className="command-prefix link-icon-prefix">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
              </span>
              <input
                className="command-field"
                placeholder="Paste link here (e.g. https://arxiv.org/abs/1706.03762)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
              {navigator.clipboard && (
                <button
                  type="button"
                  className="btn-clipboard-paste"
                  onClick={handlePasteClipboard}
                  title="Paste link from clipboard"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                  </svg>
                  <span>Paste</span>
                </button>
              )}
              {url && (
                <button className="command-clear" onClick={() => setUrl("")} title="Clear link">
                  ✕
                </button>
              )}
              <button
                className="btn-execute"
                onClick={handleSubmit}
                disabled={loading || !url.trim()}
              >
                <span>Analyze Paper</span>
                <span className="btn-kbd">➔</span>
              </button>
            </div>

            {/* Supported formats */}
            <div className="supported-formats-strip">
              <span className="supported-label">Supports:</span>
              <span className="format-tag">arXiv (abs / pdf)</span>
              <span className="format-tag">Semantic Scholar</span>
              <span className="format-tag">OpenAlex</span>
              <span className="format-tag">Direct Article URLs</span>
            </div>

            {/* Clickable Sample Links */}
            <div className="sample-links-box">
              <div className="sample-links-header">
                <span className="sample-links-icon">💡</span>
                <span className="sample-links-title">
                  Want to test it right now? Click any paper below:
                </span>
              </div>
              <div className="sample-links-cards">
                {SAMPLE_LINKS.map((sample) => {
                  const isSelected = url === sample.url;
                  return (
                    <div
                      key={sample.url}
                      className={`sample-link-card ${isSelected ? "selected" : ""}`}
                      onClick={() => setUrl(sample.url)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="sample-link-left">
                        <div className="sample-tag-row">
                          <span className="sample-tag">Landmark Paper</span>
                          {isSelected && <span className="sample-selected-tag">Selected</span>}
                        </div>
                        <div className="sample-link-name">{sample.name}</div>
                        <div className="sample-link-url">{sample.url}</div>
                      </div>
                      <div className="sample-link-right">
                        <button
                          type="button"
                          className={`btn-sample-select ${isSelected ? "active" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setUrl(sample.url);
                          }}
                        >
                          {isSelected ? "Selected ✓" : "Click to Use ➔"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Upload PDF */}
        {mode === "pdf" && (
          <div className="console-body">
            <div className="tab-instruction">
              <strong>Upload research paper PDFs from your computer:</strong>
            </div>

            <div
              className={`upload-drop-zone ${dragging ? "active" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
              onClick={() => fileRef.current.click()}
            >
              <div className="drop-graphic">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
              </div>
              <div className="drop-title">Click to choose PDF or drag & drop files here</div>
              <div className="drop-caption">You can select one or multiple research paper PDFs</div>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              multiple
              style={{ display: "none" }}
              onChange={(e) => addFiles(e.target.files)}
            />

            {files.length > 0 && (
              <div className="uploaded-file-manifest">
                <div className="manifest-header">
                  <span>{files.length} PDF file{files.length > 1 ? "s" : ""} selected:</span>
                  <button className="manifest-clear" onClick={() => setFiles([])}>Remove All</button>
                </div>
                <div className="manifest-items">
                  {files.map((f) => (
                    <div className="manifest-row" key={f.name}>
                      <div className="doc-icon">PDF</div>
                      <div className="doc-name">{f.name}</div>
                      <div className="doc-size">{(f.size / 1024 / 1024).toFixed(2)} MB</div>
                      <button
                        className="doc-remove"
                        onClick={() => setFiles((p) => p.filter((x) => x.name !== f.name))}
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              className="btn-execute full"
              onClick={handleSubmit}
              disabled={loading || files.length === 0}
            >
              Analyze {files.length > 0 ? `${files.length} PDF${files.length > 1 ? "s" : ""}` : "Files"} ➔
            </button>
          </div>
        )}

        {/* Tab 4: Paste Text */}
        {mode === "text" && (
          <div className="console-body">
            <div className="tab-instruction">
              <strong>Paste academic paper text, abstract, or methodology:</strong>
            </div>

            <div className="textarea-frame">
              <textarea
                className="editorial-textarea"
                placeholder="Paste paper text here..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
              />
              <div className="textarea-status-bar">
                <span>{text.split(/\s+/).filter(Boolean).length} words</span>
                <span>{text.length} characters</span>
              </div>
            </div>

            <button
              className="btn-execute full"
              onClick={handleSubmit}
              disabled={loading || !text.trim()}
            >
              Analyze Text ➔
            </button>
          </div>
        )}
      </div>

      {/* Progress Overlay */}
      {loading && (
        <div className="pipeline-overlay">
          <div className="pipeline-panel">
            <div className="pipeline-header">
              <div className="pipeline-pulse-dot" />
              <div className="pipeline-title-group">
                <div className="pipeline-title">Analyzing Research Papers</div>
                <div className="pipeline-ticker">Elapsed: {elapsed} seconds</div>
              </div>
            </div>

            <div className="pipeline-track">
              <div className="pipeline-runner" />
            </div>

            <div className="pipeline-stage-view">
              <div className="stage-index">Step {scanIdx + 1} of {SCANNING_STEPS.length}</div>
              <div className="stage-name">{SCANNING_STEPS[scanIdx].title}</div>
              <div className="stage-detail">{SCANNING_STEPS[scanIdx].detail}</div>
            </div>

            <div className="pipeline-steps-checklist">
              {SCANNING_STEPS.map((s, idx) => (
                <div
                  key={s.title}
                  className={`pipeline-check-item ${idx < scanIdx ? "complete" : idx === scanIdx ? "current" : "pending"}`}
                >
                  <span className="check-icon">
                    {idx < scanIdx ? "✓" : idx === scanIdx ? "●" : "○"}
                  </span>
                  <span className="check-label">{s.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}