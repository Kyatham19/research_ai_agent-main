import React, { useState, useEffect, useMemo } from "react";
import { API, authFetch } from "../utils/api";

export default function Sidebar({
  currentId,
  onSelect,
  onNew,
  onLiteratureHome,
  onDraftHome,
  refreshTrigger,
  theme,
  onToggleTheme,
}) {
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");

  useEffect(() => {
    fetchWorkspaces();
  }, [refreshTrigger]);

  const fetchWorkspaces = async () => {
    try {
      const res = await authFetch(`${API}/api/workspaces`);
      const data = await res.json();
      setWorkspaces(Array.isArray(data) ? data : []);
    } catch {
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFavorite = async (e, id) => {
    e.stopPropagation();
    try {
      const res = await authFetch(`${API}/api/favorite/${id}`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to update favorite");
      await fetchWorkspaces();
    } catch {
      // non-fatal
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm("Permanently remove this research workspace?")) return;
    try {
      const res = await authFetch(`${API}/api/workspaces/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete workspace");
      await fetchWorkspaces();
      if (currentId === id) onNew();
    } catch {
      await fetchWorkspaces();
    }
  };

  const formatRelativeTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const filtered = useMemo(() => {
    if (!filterQuery.trim()) return workspaces;
    const q = filterQuery.toLowerCase();
    return workspaces.filter(
      (w) =>
        (w.query || "").toLowerCase().includes(q) ||
        (w.mode || "").toLowerCase().includes(q)
    );
  }, [workspaces, filterQuery]);

  const favorites = filtered.filter((w) => w.favorite);
  const recent = filtered.filter((w) => !w.favorite);

  const getFormatBadge = (mode) => {
    const m = (mode || "topic").toUpperCase();
    return <span className="mode-tag">{m}</span>;
  };

  if (collapsed) {
    return (
      <aside className="nav-rail-collapsed">
        <div className="rail-brand-icon" onClick={() => setCollapsed(false)}>
          <span>R</span>
        </div>

        <div className="rail-actions">
          <button
            className="rail-btn"
            onClick={() => setCollapsed(false)}
            title="Expand Navigation"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>

          <button
            className="rail-btn accent"
            onClick={onNew}
            title="New Research"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>

          <button
            className="rail-btn"
            onClick={onLiteratureHome}
            title="Literature Reviews"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
          </button>

          <button
            className="rail-btn"
            onClick={onDraftHome}
            title="Paper Drafts"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
        </div>

        <div className="rail-footer">
          <button
            className="rail-btn"
            onClick={onToggleTheme}
            title="Toggle theme"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
            </svg>
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="nav-panel">
      {/* Brand Header */}
      <div className="nav-header">
        <div className="nav-brand" onClick={onNew}>
          <div className="brand-symbol">
            <span>R</span>
          </div>
          <div className="brand-text">
            <span className="brand-name">ResearchAI</span>
            <span className="brand-tier">v2.5 · Scientific Edition</span>
          </div>
        </div>
        <button
          className="btn-collapse"
          onClick={() => setCollapsed(true)}
          title="Collapse navigation"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
      </div>

      {/* New Research CTA */}
      <div className="nav-cta-row">
        <button className="btn-create-research" onClick={onNew}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>New Research Analysis</span>
        </button>
      </div>

      {/* Primary Workspaces Navigation Links */}
      <div className="nav-quick-links">
        <button className="nav-item-link" onClick={onLiteratureHome}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
          <span>Literature Reviews</span>
        </button>
        <button className="nav-item-link" onClick={onDraftHome}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
          <span>Paper Drafts</span>
        </button>
      </div>

      {/* Filter Workspaces */}
      <div className="nav-search-bar">
        <div className="search-field-shell">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Filter archives..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
          />
          {filterQuery && (
            <button className="btn-clear-filter" onClick={() => setFilterQuery("")}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Workspace List */}
      <div className="nav-workspaces-scroll">
        {loading ? (
          <div className="workspaces-loading">
            <div className="skeleton-line" />
            <div className="skeleton-line short" />
            <div className="skeleton-line" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="workspaces-empty">
            <span>{filterQuery ? "No matching records found" : "No saved research runs"}</span>
          </div>
        ) : (
          <>
            {/* Pinned Analyses */}
            {favorites.length > 0 && (
              <div className="workspace-group">
                <div className="group-heading">
                  <span>Pinned ({favorites.length})</span>
                </div>
                {favorites.map((w) => (
                  <WorkspaceEntry
                    key={w.id}
                    workspace={w}
                    isActive={currentId === w.id}
                    onSelect={() => onSelect(w.id)}
                    onFavorite={(e) => handleFavorite(e, w.id)}
                    onDelete={(e) => handleDelete(e, w.id)}
                    formatRelativeTime={formatRelativeTime}
                    getFormatBadge={getFormatBadge}
                  />
                ))}
              </div>
            )}

            {/* Recent Analyses */}
            {recent.length > 0 && (
              <div className="workspace-group">
                <div className="group-heading">
                  <span>Recent Archives ({recent.length})</span>
                </div>
                {recent.map((w) => (
                  <WorkspaceEntry
                    key={w.id}
                    workspace={w}
                    isActive={currentId === w.id}
                    onSelect={() => onSelect(w.id)}
                    onFavorite={(e) => handleFavorite(e, w.id)}
                    onDelete={(e) => handleDelete(e, w.id)}
                    formatRelativeTime={formatRelativeTime}
                    getFormatBadge={getFormatBadge}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Clean Status Footer */}
      <div className="nav-footer">
        <div className="runtime-indicator">
          <span className="runtime-dot" />
          <span>Flask REST API · Online</span>
        </div>
      </div>
    </aside>
  );
}

function WorkspaceEntry({
  workspace,
  isActive,
  onSelect,
  onFavorite,
  onDelete,
  formatRelativeTime,
  getFormatBadge,
}) {
  return (
    <div
      className={`workspace-row ${isActive ? "active" : ""}`}
      onClick={onSelect}
      title={workspace.query}
    >
      <div className="row-top">
        <span className="row-title">{workspace.query || "Untitled Analysis"}</span>
      </div>

      <div className="row-bottom">
        <div className="row-chips">
          {getFormatBadge(workspace.mode)}
          {workspace.paper_count > 0 && (
            <span className="count-tag">{workspace.paper_count} papers</span>
          )}
        </div>
        <span className="row-time">{formatRelativeTime(workspace.created_at)}</span>
      </div>

      <div className="row-actions">
        <button
          className={`action-icon-btn ${workspace.favorite ? "starred" : ""}`}
          onClick={onFavorite}
          title={workspace.favorite ? "Unpin search" : "Pin search"}
        >
          {workspace.favorite ? "★" : "☆"}
        </button>
        <button
          className="action-icon-btn delete"
          onClick={onDelete}
          title="Delete workspace"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>
  );
}
