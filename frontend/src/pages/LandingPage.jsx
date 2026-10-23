import React from "react";
import InputPage from "./Inputpage";
import HistoryPage from "./HistoryPage";

export default function LandingPage({
  onNavigate,
  onScrollTo,
  mode,
  setMode,
  onResults,
  onError,
  loading,
  setLoading,
  onSelectWorkspace,
  onOpenLiteratureWithPapers,
  onOpenDraftWithPapers,
  historyCount = 0,
  user,
  onOpenAuth,
}) {
  const handleScrollToRetrieval = () => {
    if (onScrollTo) {
      onScrollTo("retrieval-section");
    } else {
      const el = document.getElementById("retrieval-section");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="landing-single-page">
      {/* ─── 1. HERO SECTION ─── */}
      <section id="hero-section" className="landing-hero-section">
        <div className="landing-ambient-glow" />

        <div className="landing-hero-container">
          {/* Eyebrow Badge */}
          <div className="landing-badge">
            <span className="landing-badge-spark">✨</span>
            <span className="landing-badge-text">Autonomous Multi-Agent Academic Intelligence</span>
            <span className="landing-badge-tag">arXiv · PubMed · Semantic Scholar</span>
          </div>

          {/* Main Headline */}
          <h1 className="landing-headline">
            Accelerate Scientific Discovery &<br />
            <span className="landing-headline-gradient">Synthesize Academic Research</span>
          </h1>

          {/* Subtitle */}
          <p className="landing-subheading">
            A dedicated AI workspace engineered for researchers, scientists, and academics.
            Retrieve literature across millions of publications, generate thematic literature reviews,
            and draft publication-ready manuscripts in seconds.
          </p>

          {/* Directed CTA Buttons */}
          <div className="landing-cta-row">
            <button
              type="button"
              className="landing-btn-primary"
              onClick={handleScrollToRetrieval}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <span>Start Paper Retrieval</span>
              <span className="cta-arrow">↓</span>
            </button>

            <button
              type="button"
              className="landing-btn-secondary"
              onClick={() => onNavigate("literature")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
              </svg>
              <span>Literature Review Studio ➔</span>
            </button>

            <button
              type="button"
              className="landing-btn-secondary"
              onClick={() => onNavigate("draft")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
              <span>Draft Research Paper ➔</span>
            </button>
          </div>

          {/* Value Proof Strip */}
          <div className="landing-proof-strip">
            <div className="proof-item">
              <span className="proof-check">✓</span>
              <span>100M+ Open-Access Papers</span>
            </div>
            <div className="proof-divider" />
            <div className="proof-item">
              <span className="proof-check">✓</span>
              <span>Direct arXiv & PubMed Extraction</span>
            </div>
            <div className="proof-divider" />
            <div className="proof-item">
              <span className="proof-check">✓</span>
              <span>Zero-Hallucination Grounding</span>
            </div>
            <div className="proof-divider" />
            <div className="proof-item">
              <span className="proof-check">✓</span>
              <span>Export to Word & PDF</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 2. ABOUT & CAPABILITIES SECTION ─── */}
      <section id="about-section" className="about-section-container">
        <div className="section-header-centered">
          <span className="section-eyebrow-pill">ABOUT RESEARCHAI</span>
          <h2 className="section-main-heading">Engineered for Rigorous Scientific Synthesis</h2>
          <p className="section-subtext">
            Autonomous multi-agent intelligence that eliminates hours of manual literature review while ensuring scientific rigor and citation fidelity.
          </p>
        </div>

        {/* 4 Feature Pillars */}
        <div className="about-pillars-grid">
          <div className="about-pillar-card">
            <div className="pillar-icon-box">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <h3 className="pillar-title">Deep Academic Retrieval</h3>
            <p className="pillar-desc">
              Query broad academic topics across arXiv, PubMed, and Semantic Scholar, or paste direct paper URLs and upload PDF manuscripts for immediate ingestion.
            </p>
          </div>

          <div className="about-pillar-card">
            <div className="pillar-icon-box">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
            </div>
            <h3 className="pillar-title">Automated Gap Extraction</h3>
            <p className="pillar-desc">
              Our agent dissects papers to isolate methodologies, empirical findings, study limitations, and critical unexplored research trajectories.
            </p>
          </div>

          <div className="about-pillar-card" onClick={() => onNavigate("literature")}>
            <div className="pillar-icon-box">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
              </svg>
            </div>
            <h3 className="pillar-title">Thematic Literature Reviews</h3>
            <p className="pillar-desc">
              Synthesize multiple papers into thematic matrices, comparative tables, and chronological trajectories with 1-click export to Word and PDF.
            </p>
            <span className="pillar-link">Open Literature Studio ➔</span>
          </div>

          <div className="about-pillar-card" onClick={() => onNavigate("draft")}>
            <div className="pillar-icon-box">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </div>
            <h3 className="pillar-title">Manuscript Draft Builder</h3>
            <p className="pillar-desc">
              Transform synthesized literature into structured academic drafts complete with abstract, related work, methodology, and citations.
            </p>
            <span className="pillar-link">Open Draft Studio ➔</span>
          </div>
        </div>

        {/* 3-Step Sequence */}
        <div className="about-workflow-strip">
          <div className="workflow-step">
            <span className="step-num">01</span>
            <div className="step-info">
              <strong>Query or Ingest</strong>
              <span>Search topics or drop arXiv links & PDFs below</span>
            </div>
          </div>
          <div className="workflow-arrow">➔</div>
          <div className="workflow-step">
            <span className="step-num">02</span>
            <div className="step-info">
              <strong>Multi-Agent Synthesis</strong>
              <span>AI extracts methods, contributions & research gaps</span>
            </div>
          </div>
          <div className="workflow-arrow">➔</div>
          <div className="workflow-step">
            <span className="step-num">03</span>
            <div className="step-info">
              <strong>Review & Publish</strong>
              <span>Build literature reviews, draft papers & export</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 3. PAPER RETRIEVAL CONSOLE SECTION (ALL INPUT OPTIONS) ─── */}
      <section id="retrieval-section" className="retrieval-section-container">
        {/* Embedded Input Console with all input options */}
        <div className="embedded-console-wrapper">
          <InputPage
            mode={mode}
            setMode={setMode}
            onResults={onResults}
            onError={onError}
            loading={loading}
            setLoading={setLoading}
          />
        </div>
      </section>

      {/* ─── 4. RESEARCH HISTORY & ARCHIVE SECTION ─── */}
      <section id="history-section" className="history-section-container">
        <HistoryPage
          onSelectWorkspace={onSelectWorkspace}
          onNavigate={onNavigate}
          onOpenLiteratureWithPapers={onOpenLiteratureWithPapers}
          onOpenDraftWithPapers={onOpenDraftWithPapers}
          user={user}
          onOpenAuth={onOpenAuth}
        />
      </section>
    </div>
  );
}
