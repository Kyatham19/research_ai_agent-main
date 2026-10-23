import React, { useState, useEffect, useRef } from "react";

export default function Header({
  view,
  onNavigate,
  onScrollTo,
  theme,
  onToggleTheme,
  isScrolled = false,
  activeSection = "hero",
  historyCount = 0,
  user = null,
  onOpenAuth,
  onLogout,
}) {
  const [backendHealth, setBackendHealth] = useState({ online: true, keySet: false });
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    fetch("/health")
      .then((r) => r.json())
      .then((data) => {
        setBackendHealth({ online: true, keySet: Boolean(data.api_key_configured) });
      })
      .catch(() => {
        setBackendHealth({ online: false, keySet: false });
      });
  }, []);

  // Center navbar options are hidden on the top hero, and appear when scrolling down.
  // On separate pages ("literature", "draft", "results"), navbar options are always visible.
  const showNavOptions = view !== "home" || isScrolled;

  const handleBrandClick = () => {
    if (view === "home") {
      if (onScrollTo) onScrollTo("hero-section");
    } else {
      onNavigate("home", "hero-section");
    }
  };

  const handleAboutClick = () => {
    if (view === "home") {
      if (onScrollTo) onScrollTo("about-section");
    } else {
      onNavigate("home", "about-section");
    }
  };

  const handleRetrievalClick = () => {
    if (view === "home") {
      if (onScrollTo) onScrollTo("retrieval-section");
    } else {
      onNavigate("home", "retrieval-section");
    }
  };

  const handleHistoryClick = () => {
    if (view === "home") {
      if (onScrollTo) onScrollTo("history-section");
    } else {
      onNavigate("home", "history-section");
    }
  };

  return (
    <header className={`navbar-top ${isScrolled || view !== "home" ? "navbar-top--scrolled" : "navbar-top--transparent"}`}>
      {/* Left: Brand Identity (Always visible on hero and scrolled) */}
      <div className="navbar-brand-section">
        <div
          className="brand-anchor"
          onClick={handleBrandClick}
          role="button"
          tabIndex={0}
        >
          <div className="brand-icon-wrapper">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </div>
          <div className="brand-text-col">
            <span className="brand-name">ResearchAI</span>
            <span className="brand-sub">STUDIO</span>
          </div>
        </div>
      </div>

      {/* Center Navigation Links with Active Section Tracking & Hover States */}
      <nav className={`navbar-nav-center ${showNavOptions ? "nav-options--visible" : "nav-options--hidden"}`}>
        <button
          className={`nav-link ${view === "home" && activeSection === "hero" ? "active" : ""}`}
          onClick={handleBrandClick}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
          <span>Home</span>
        </button>

        <button
          className={`nav-link ${view === "home" && activeSection === "about" ? "active" : ""}`}
          onClick={handleAboutClick}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <span>About</span>
        </button>

        <button
          className={`nav-link ${view === "home" && activeSection === "retrieval" ? "active" : ""}`}
          onClick={handleRetrievalClick}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <span>Paper Retrieval</span>
        </button>

        <button
          className={`nav-link ${view === "literature" ? "active" : ""}`}
          onClick={() => onNavigate("literature")}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
          <span>Literature Review</span>
        </button>

        <button
          className={`nav-link ${view === "draft" ? "active" : ""}`}
          onClick={() => onNavigate("draft")}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
          <span>Paper Draft</span>
        </button>

        <button
          className={`nav-link ${view === "home" && activeSection === "history" ? "active" : ""}`}
          onClick={handleHistoryClick}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>History</span>
          {historyCount > 0 && <span className="nav-badge-pill">{historyCount}</span>}
        </button>
      </nav>

      {/* Right: AI Engine status, User Profile / Auth, Theme Switch */}
      <div className="navbar-actions-right">
        {/* Engine Status */}
        <div className="engine-status-badge">
          <span className={`engine-status-dot ${backendHealth.online ? "active" : "inactive"}`} />
          <span className="engine-status-text">
            {backendHealth.online
              ? backendHealth.keySet
                ? "gemini-2.5-flash"
                : "heuristics engine"
              : "engine offline"}
          </span>
        </div>

        {/* User Authentication / Profile Dropdown */}
        {user ? (
          <div className="navbar-user-wrapper" ref={userMenuRef}>
            <button
              type="button"
              className="navbar-user-btn"
              onClick={() => setUserMenuOpen((o) => !o)}
              title="Account Settings & Session"
            >
              <span className="user-avatar-initial">
                {user.name ? user.name.charAt(0).toUpperCase() : "U"}
              </span>
              <span className="user-short-name">{user.name ? user.name.split(" ")[0] : "User"}</span>
              <span className="user-arrow-indicator">▾</span>
            </button>

            {userMenuOpen && (
              <div className="navbar-user-dropdown">
                <div className="dropdown-user-header">
                  <div className="dropdown-user-name">{user.name}</div>
                  <div className="dropdown-user-email">{user.email}</div>
                  <span className="dropdown-user-badge">Academic Access</span>
                </div>
                <div className="dropdown-divider" />
                <button
                  type="button"
                  className="dropdown-menu-item"
                  onClick={() => {
                    setUserMenuOpen(false);
                    handleHistoryClick();
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  <span>My Workspace History</span>
                </button>
                <div className="dropdown-divider" />
                <button
                  type="button"
                  className="dropdown-menu-item signout"
                  onClick={() => {
                    setUserMenuOpen(false);
                    onLogout();
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="navbar-signin-btn"
            onClick={onOpenAuth}
            title="Sign in with your researcher account"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span>Sign In</span>
          </button>
        )}

        {/* Theme Switcher */}
        <button
          className="navbar-theme-btn"
          onClick={onToggleTheme}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          aria-label="Toggle visual theme"
        >
          {theme === "dark" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}