import React, { useState, useEffect, useMemo } from "react";
import { API, authFetch } from "../utils/api";

export default function HistoryPage({
  onSelectWorkspace,
  onNavigate,
  onOpenLiteratureWithPapers,
  onOpenDraftWithPapers,
  user,
  onOpenAuth,
}) {
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all"); // "all" | "favorites" | "topic" | "url" | "pdf"
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchWorkspaces();
  }, [user]);

  const fetchWorkspaces = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/api/workspaces`);
      const data = await res.json();
      setWorkspaces(Array.isArray(data) ? data : []);
    } catch {
      setError("Unable to load saved workspaces. Please ensure the backend is running.");
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFavorite = async (e, id) => {
    e.stopPropagation();
    try {
      const res = await authFetch(`${API}/api/favorite/${id}`, { method: "POST" });
      if (!res.ok) throw new Error();
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === id ? { ...w, favorite: !w.favorite } : w))
      );
    } catch {
      // non-fatal
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Permanently remove this research workspace and its saved papers?")) return;
    try {
      const res = await authFetch(`${API}/api/workspaces/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setWorkspaces((prev) => prev.filter((w) => w.id !== id));
    } catch {
      setError("Failed to delete workspace.");
    }
  };

  const handleQuickLiterature = async (e, ws) => {
    e.stopPropagation();
    setActionLoadingId(ws.id);
    try {
      const res = await authFetch(`${API}/api/workspaces/${ws.id}`);
      const data = await res.json();
      const papers = data.papers || [];
      if (onOpenLiteratureWithPapers) {
        onOpenLiteratureWithPapers(papers, ws.query);
      } else {
        onNavigate("literature");
      }
    } catch {
      onNavigate("literature");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleQuickDraft = async (e, ws) => {
    e.stopPropagation();
    setActionLoadingId(ws.id);
    try {
      const res = await authFetch(`${API}/api/workspaces/${ws.id}`);
      const data = await res.json();
      const analyses = data.analyses || [];
      const papers = (data.papers || []).map((p, i) => ({
        ...p,
        ...(analyses[i] || {}),
      }));
      if (onOpenDraftWithPapers) {
        onOpenDraftWithPapers(papers, ws.query);
      } else {
        onNavigate("draft");
      }
    } catch {
      onNavigate("draft");
    } finally {
      setActionLoadingId(null);
    }
  };

  const formatRelativeTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  // Filter & Search Logic
  const filteredWorkspaces = useMemo(() => {
    let list = workspaces;

    if (activeFilter === "favorites") {
      list = list.filter((w) => w.favorite);
    } else if (activeFilter === "topic") {
      list = list.filter((w) => (w.mode || "topic") === "topic");
    } else if (activeFilter === "url") {
      list = list.filter((w) => w.mode === "url");
    } else if (activeFilter === "pdf") {
      list = list.filter((w) => w.mode === "pdf");
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (w) =>
          (w.query || "").toLowerCase().includes(q) ||
          (w.mode || "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [workspaces, activeFilter, searchQuery]);

  const totalPapers = useMemo(() => {
    return workspaces.reduce((acc, curr) => acc + (curr.paper_count || 0), 0);
  }, [workspaces]);

  const favoriteCount = useMemo(() => {
    return workspaces.filter((w) => w.favorite).length;
  }, [workspaces]);

  const getModeLabel = (mode) => {
    const m = (mode || "topic").toLowerCase();
    if (m === "url") return { label: "Paper Link", icon: "🔗", class: "mode-pill--url" };
    if (m === "pdf") return { label: "PDF Document", icon: "📄", class: "mode-pill--pdf" };
    if (m === "text") return { label: "Abstract Text", icon: "📝", class: "mode-pill--text" };
    return { label: "Topic Search", icon: "🔍", class: "mode-pill--topic" };
  };

  return (
    <div className="history-page">
      {/* Header Banner */}
      <div className="history-header">
        <div className="history-header__left">
          <div className="history-eyebrow">
            <span className="history-dot" />
            <span>RESEARCH REPOSITORY</span>
          </div>
          <h1 className="history-title">Saved Papers & Inquiries</h1>
          <p className="history-subtitle">
            Browse, search, and reopen all your previous literature searches, extracted datasets, and paper analyses.
          </p>
        </div>

        {/* Stats Strip */}
        <div className="history-stats">
          <div className="history-stat-box">
            <span className="stat-number">{workspaces.length}</span>
            <span className="stat-label">Saved Workspaces</span>
          </div>
          <div className="history-stat-box">
            <span className="stat-number">{totalPapers}</span>
            <span className="stat-label">Papers Cataloged</span>
          </div>
          <div className="history-stat-box">
            <span className="stat-number">{favoriteCount}</span>
            <span className="stat-label">Starred Favorites</span>
          </div>
        </div>
      </div>

      {/* User Isolation Status Banner */}
      {user ? (
        <div className="history-user-strip">
          <div className="history-user-strip__left">
            <span className="history-user-badge-dot" />
            <span className="history-user-text">
              Showing isolated research archive for <strong>{user.name}</strong> ({user.email})
            </span>
          </div>
          <span className="history-user-tag">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            Personal & Isolated
          </span>
        </div>
      ) : (
        <div className="history-user-strip history-user-strip--guest">
          <div className="history-user-strip__left">
            <span className="history-guest-icon">🔒</span>
            <span className="history-user-text">
              <strong>Guest Workspace</strong> — Each registered researcher has their own separate private history. Sign in to view and save your personal literature archives.
            </span>
          </div>
          {onOpenAuth && (
            <button
              type="button"
              className="history-signin-prompt-btn"
              onClick={onOpenAuth}
            >
              Sign In / Register
            </button>
          )}
        </div>
      )}

      {/* Control Bar: Search & Filter Tabs */}
      <div className="history-toolbar">
        {/* Search Input */}
        <div className="history-search-shell">
          <span className="search-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </span>
          <input
            className="history-search-input"
            placeholder="Search past topics, queries, or paper names..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="history-search-clear"
              onClick={() => setSearchQuery("")}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Category Filter Pills */}
        <div className="history-filters">
          <button
            className={`filter-pill ${activeFilter === "all" ? "active" : ""}`}
            onClick={() => setActiveFilter("all")}
          >
            All Sessions ({workspaces.length})
          </button>
          <button
            className={`filter-pill ${activeFilter === "favorites" ? "active" : ""}`}
            onClick={() => setActiveFilter("favorites")}
          >
            ⭐ Starred ({favoriteCount})
          </button>
          <button
            className={`filter-pill ${activeFilter === "topic" ? "active" : ""}`}
            onClick={() => setActiveFilter("topic")}
          >
            Topic Searches
          </button>
          <button
            className={`filter-pill ${activeFilter === "url" ? "active" : ""}`}
            onClick={() => setActiveFilter("url")}
          >
            arXiv / URLs
          </button>
          <button
            className={`filter-pill ${activeFilter === "pdf" ? "active" : ""}`}
            onClick={() => setActiveFilter("pdf")}
          >
            PDF Uploads
          </button>
        </div>

        {/* Start New Search Button */}
        <button
          className="history-new-btn"
          onClick={() => onNavigate("retrieval")}
        >
          <span>+ New Retrieval</span>
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="history-error-card">
          <span>⚠ {error}</span>
          <button onClick={fetchWorkspaces} className="btn-retry">Retry</button>
        </div>
      )}

      {/* Content Area */}
      {loading ? (
        <div className="history-loading-state">
          <div className="spinner" style={{ width: 28, height: 28 }} />
          <span>Loading your research repository…</span>
        </div>
      ) : filteredWorkspaces.length === 0 ? (
        <div className="history-empty-state">
          {searchQuery || activeFilter !== "all" ? (
            <>
              <div className="empty-icon">🔍</div>
              <h3 className="empty-title">No matching workspaces</h3>
              <p className="empty-desc">
                No past research matched your filter <strong>"{searchQuery || activeFilter}"</strong>.
              </p>
              <button
                className="empty-cta-btn"
                onClick={() => {
                  setSearchQuery("");
                  setActiveFilter("all");
                }}
              >
                Reset Filters
              </button>
            </>
          ) : (
            <>
              <div className="empty-icon">📚</div>
              <h3 className="empty-title">Your research history is empty</h3>
              <p className="empty-desc">
                Every topic search, arXiv link extraction, or PDF document you analyze will automatically be cataloged and organized here for future review.
              </p>
              <button
                className="empty-cta-btn"
                onClick={() => onNavigate("retrieval")}
              >
                <span>Start Your First Paper Retrieval ➔</span>
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="history-grid">
          {filteredWorkspaces.map((ws) => {
            const modeInfo = getModeLabel(ws.mode);
            const isBusy = actionLoadingId === ws.id;

            return (
              <div
                key={ws.id}
                className={`history-card ${ws.favorite ? "history-card--favorite" : ""}`}
                onClick={() => onSelectWorkspace(ws.id)}
              >
                {/* Card Header */}
                <div className="card-header-row">
                  <span className={`history-mode-pill ${modeInfo.class}`}>
                    <span className="mode-icon">{modeInfo.icon}</span>
                    <span>{modeInfo.label}</span>
                  </span>

                  <div className="card-top-actions">
                    <button
                      className={`btn-card-favorite ${ws.favorite ? "starred" : ""}`}
                      onClick={(e) => handleFavorite(e, ws.id)}
                      title={ws.favorite ? "Remove from starred" : "Star as favorite"}
                    >
                      {ws.favorite ? "★" : "☆"}
                    </button>
                    <button
                      className="btn-card-delete"
                      onClick={(e) => handleDelete(e, ws.id)}
                      title="Delete this workspace"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Card Title */}
                <h3 className="card-query-title" title={ws.query}>
                  {ws.query || "Untitled Workspace"}
                </h3>

                {/* Card Meta */}
                <div className="card-meta-row">
                  <div className="meta-item">
                    <span className="meta-icon">📄</span>
                    <strong>{ws.paper_count || 0}</strong>
                    <span>paper{ws.paper_count !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="meta-dot">·</div>
                  <div className="meta-item">
                    <span className="meta-time">{formatRelativeTime(ws.last_opened || ws.created_at)}</span>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="card-actions-row">
                  <button
                    type="button"
                    className="btn-action-view"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectWorkspace(ws.id);
                    }}
                  >
                    <span>Open Results ➔</span>
                  </button>

                  <div className="card-secondary-actions">
                    <button
                      type="button"
                      className="btn-action-small"
                      title="Use in Literature Review"
                      disabled={isBusy}
                      onClick={(e) => handleQuickLiterature(e, ws)}
                    >
                      {isBusy ? "…" : "📚 Review"}
                    </button>
                    <button
                      type="button"
                      className="btn-action-small"
                      title="Use in Paper Draft"
                      disabled={isBusy}
                      onClick={(e) => handleQuickDraft(e, ws)}
                    >
                      {isBusy ? "…" : "📝 Draft"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
