import { useState, useRef } from "react";

const API = "http://localhost:5000";

const MODES = [
  { id: "topic", icon: "🔍", label: "Topic Search" },
  { id: "pdf",   icon: "📄", label: "PDF Upload" },
  { id: "url",   icon: "🔗", label: "URL" },
  { id: "text",  icon: "✏️", label: "Raw Text" },
];

export default function InputPanel({ activeMode, setActiveMode, onResults, onError, loading, setLoading }) {
  const [topic, setTopic]       = useState("");
  const [maxPapers, setMaxPapers] = useState(5);
  const [url, setUrl]           = useState("");
  const [text, setText]         = useState("");
  const [file, setFile]         = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();

  const handleSubmit = async () => {
    setLoading(true);
    try {
      let res, data;

      if (activeMode === "topic") {
        if (!topic.trim()) { onError("Please enter a topic."); setLoading(false); return; }
        res = await fetch(`${API}/analyze/topic`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: topic.trim(), max_papers: maxPapers }),
        });

      } else if (activeMode === "pdf") {
        if (!file) { onError("Please upload a PDF."); setLoading(false); return; }
        const form = new FormData();
        form.append("file", file);
        res = await fetch(`${API}/analyze/pdf`, { method: "POST", body: form });

      } else if (activeMode === "url") {
        if (!url.trim()) { onError("Please enter a URL."); setLoading(false); return; }
        res = await fetch(`${API}/analyze/url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });

      } else if (activeMode === "text") {
        if (!text.trim()) { onError("Please paste some text."); setLoading(false); return; }
        res = await fetch(`${API}/analyze/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.trim() }),
        });
      }

      data = await res.json();
      if (!res.ok) { onError(data.error || "Analysis failed."); setLoading(false); return; }
      onResults({ ...data, _mode: activeMode, _input: topic || url || file?.name || "Text input" });

    } catch (e) {
      onError("Could not connect to backend. Make sure the Flask server is running on port 5000.");
    }
    setLoading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f?.name.endsWith(".pdf")) setFile(f);
    else onError("Only PDF files are supported.");
  };

  return (
    <div className="input-panel">
      <div className="panel-hero">
        <h1>Analyze <em>research</em> papers with AI</h1>
        <p>Search by topic, upload a PDF, paste a URL, or drop in raw text — get structured insights instantly.</p>
      </div>

      <div className="mode-tabs">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`mode-tab${activeMode === m.id ? " active" : ""}`}
            onClick={() => setActiveMode(m.id)}
          >
            {m.icon} <span>{m.label}</span>
          </button>
        ))}
      </div>

      <div className="input-card">
        {activeMode === "topic" && (
          <>
            <label className="input-label">Research topic or keywords</label>
            <input
              className="input-field"
              placeholder="e.g. transformer attention mechanism, BERT fine-tuning, quantum computing..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            <div className="slider-row">
              <label>Papers to fetch:</label>
              <input
                type="range" min="1" max="10" step="1"
                value={maxPapers}
                onChange={(e) => setMaxPapers(Number(e.target.value))}
              />
              <span className="slider-val">{maxPapers}</span>
            </div>
          </>
        )}

        {activeMode === "pdf" && (
          <>
            <label className="input-label">Upload research paper PDF</label>
            <div
              className={`drop-zone${dragging ? " dragging" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current.click()}
            >
              <div className="drop-icon">{file ? "✅" : "📄"}</div>
              <div className="drop-text">
                {file ? (
                  <span className="file-name">{file.name}</span>
                ) : (
                  <><strong>Click to browse</strong> or drag & drop a PDF here</>
                )}
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              style={{ display: "none" }}
              onChange={(e) => setFile(e.target.files[0])}
            />
          </>
        )}

        {activeMode === "url" && (
          <>
            <label className="input-label">Paper URL (arXiv, DOI, or any research page)</label>
            <input
              className="input-field"
              placeholder="https://arxiv.org/abs/2310.01848"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </>
        )}

        {activeMode === "text" && (
          <>
            <label className="input-label">Paste abstract or paper text</label>
            <textarea
              className="input-field"
              placeholder="Paste your research paper text or abstract here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </>
        )}

        <button className="submit-btn" onClick={handleSubmit} disabled={loading}>
          {loading ? (
            <><div className="spinner" /> Analyzing...</>
          ) : (
            <>{activeMode === "topic" ? "🔍 Search & Analyze" : "⚡ Analyze"}</>
          )}
        </button>
      </div>
    </div>
  );
}
