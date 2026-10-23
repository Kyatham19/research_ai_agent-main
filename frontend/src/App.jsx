import { useState, useCallback, useEffect, useRef } from "react";
import Header from "./components/Header";
import LandingPage from "./pages/LandingPage";
import ResultsPage from "./pages/ResultsPage";
import LiteratureReview from "./pages/LiteratureReview";
import PaperDraft from "./pages/PaperDraft";
import AuthModal from "./components/AuthModal";
import { API, authFetch } from "./utils/api";
import "./App.css";

export default function App() {
  const [results, setResults] = useState(null);
  const [mode, setMode] = useState("topic");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState(null);
  const [historyCount, setHistoryCount] = useState(0);

  // Authentication State (SQLite persistent database)
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("rai-user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem("rai-token") || null;
    } catch {
      return null;
    }
  });

  const [showAuthModal, setShowAuthModal] = useState(false);

  // Validate active session token on app startup
  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (data.user) {
          setUser(data.user);
          localStorage.setItem("rai-user", JSON.stringify(data.user));
        }
      })
      .catch(() => {
        setUser(null);
        setToken(null);
        localStorage.removeItem("rai-user");
        localStorage.removeItem("rai-token");
      });
  }, [token]);

  const handleAuthSuccess = (data) => {
    setUser(data.user);
    setToken(data.token);
    try {
      localStorage.setItem("rai-user", JSON.stringify(data.user));
      localStorage.setItem("rai-token", data.token);
    } catch {
      // storage unavailable
    }
    setShowAuthModal(false);
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await fetch(`${API}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // non-fatal
      }
    }
    setUser(null);
    setToken(null);
    try {
      localStorage.removeItem("rai-user");
      localStorage.removeItem("rai-token");
    } catch {
      // storage unavailable
    }
  };

  // Active view: "home" | "results" | "literature" | "draft"
  // (Paper retrieval and History are unified sections inside "home")
  const [view, setView] = useState("home");
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState("hero");
  const mainScrollRef = useRef(null);

  // Theme system
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("rai-theme") || "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("rai-theme", theme);
    } catch {
      // Storage unavailable or blocked
    }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  // Track scrolling in main-scrollable to reveal navbar and update active section spy
  const handleScroll = (e) => {
    const container = e.target;
    const scrollTop = container.scrollTop;
    setIsScrolled(scrollTop > 70);

    if (view === "home") {
      const about = document.getElementById("about-section");
      const retrieval = document.getElementById("retrieval-section");
      const history = document.getElementById("history-section");

      // Offset threshold: account for navbar and viewport height
      const scrollPos = scrollTop + 220;

      if (history && history.offsetTop <= scrollPos) {
        setActiveSection("history");
      } else if (retrieval && retrieval.offsetTop <= scrollPos) {
        setActiveSection("retrieval");
      } else if (about && about.offsetTop <= scrollPos) {
        setActiveSection("about");
      } else {
        setActiveSection("hero");
      }
    }
  };

  // Smooth section scrolling within home page
  const handleScrollTo = (sectionId) => {
    const sectionMap = {
      "hero-section": "hero",
      "about-section": "about",
      "retrieval-section": "retrieval",
      "history-section": "history",
    };
    if (sectionMap[sectionId]) {
      setActiveSection(sectionMap[sectionId]);
    }

    const scrollToTarget = () => {
      if (sectionId === "hero-section" && mainScrollRef.current) {
        mainScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
        setIsScrolled(false);
      } else {
        const el = document.getElementById(sectionId);
        if (el && mainScrollRef.current) {
          const targetTop = Math.max(0, el.offsetTop - 58);
          mainScrollRef.current.scrollTo({ top: targetTop, behavior: "smooth" });
        } else if (el) {
          el.scrollIntoView({ behavior: "smooth" });
        }
      }
    };

    if (view !== "home") {
      setView("home");
      setTimeout(scrollToTarget, 100);
    } else {
      scrollToTarget();
    }
  };

  // Fetch count of saved workspaces for the Navbar badge
  const updateHistoryCount = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/api/workspaces`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setHistoryCount(data.length);
      }
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    updateHistoryCount();
  }, [updateHistoryCount, token]);

  // Ensure every analysis object has _flat keys regardless of where it came from.
  const normalizeAnalysis = (a) => {
    if (!a) return a;
    return {
      ...a,
      research_gaps_flat:
        a.research_gaps_flat ??
        (Array.isArray(a.research_gaps) ? a.research_gaps : []),
      future_scope_flat:
        a.future_scope_flat ??
        (Array.isArray(a.future_scope) ? a.future_scope : []),
    };
  };

  const normalizeTopicResult = (data) => {
    if (!data || data._mode !== "topic") return data ? normalizeAnalysis(data) : data;
    return {
      ...data,
      combined_analysis: normalizeAnalysis(data.combined_analysis),
      individual_papers: (data.individual_papers || []).map(normalizeAnalysis),
    };
  };

  const handleResults = (data, workspaceId) => {
    setResults(normalizeTopicResult(data));
    setError(null);
    setView("results");
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0 });
    }
    if (workspaceId) {
      setCurrentWorkspaceId(workspaceId);
      updateHistoryCount();
    }
  };

  const loadWorkspace = async (id) => {
    const res = await authFetch(`${API}/api/workspaces/${id}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setCurrentWorkspaceId(id);
    return data;
  };

  const handleSelectWorkspace = async (id) => {
    try {
      const ws = await loadWorkspace(id);
      if (!ws.analyses?.length) return;
      if (ws.metadata.mode === "topic") {
        setMode("topic");
        const combined =
          ws.combined && typeof ws.combined === "object" && Object.keys(ws.combined).length > 0
            ? normalizeAnalysis(ws.combined)
            : normalizeAnalysis(ws.analyses[0]);
        setResults({
          _mode: "topic",
          _input: ws.metadata.query,
          topic: ws.metadata.query,
          paper_count: ws.papers.length,
          individual_papers: ws.analyses.map(normalizeAnalysis),
          combined_analysis: combined,
          workspace_id: id,
        });
      } else {
        setMode(ws.metadata.mode || "text");
        setResults({
          ...normalizeAnalysis(ws.analyses[0]),
          _mode: ws.metadata.mode,
          _input: ws.metadata.query,
          workspace_id: id,
        });
      }
      setView("results");
      if (mainScrollRef.current) {
        mainScrollRef.current.scrollTo({ top: 0 });
      }
    } catch (err) {
      setError(err.message || "Failed to load workspace.");
    }
  };

  const handleNavigate = (targetView, targetSection) => {
    setError(null);
    if (targetView === "retrieval") {
      setView("home");
      setTimeout(() => handleScrollTo("retrieval-section"), 80);
      return;
    }
    if (targetView === "history") {
      setView("home");
      setTimeout(() => handleScrollTo("history-section"), 80);
      return;
    }
    setView(targetView);
    if (targetSection) {
      setTimeout(() => {
        handleScrollTo(targetSection);
      }, 100);
    } else if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0 });
      setIsScrolled(false);
    }
  };

  const handleNew = () => {
    setResults(null);
    setCurrentWorkspaceId(null);
    setError(null);
    setView("home");
    setTimeout(() => {
      handleScrollTo("retrieval-section");
    }, 100);
  };

  const handleOpenLiteratureWithPapers = (papers, topic) => {
    setResults({
      individual_papers: papers,
      topic: topic || "",
    });
    setView("literature");
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0 });
    }
  };

  const handleOpenDraftWithPapers = (papers, topic) => {
    setResults({
      individual_papers: papers,
      topic: topic || "",
    });
    setView("draft");
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0 });
    }
  };

  return (
    <div className="app">
      {/* Top Navbar: hidden at top of Home, slides in when scrolling down. Always visible on separate pages */}
      <Header
        view={view}
        onNavigate={handleNavigate}
        onScrollTo={handleScrollTo}
        onNew={handleNew}
        theme={theme}
        onToggleTheme={toggleTheme}
        isScrolled={isScrolled}
        activeSection={activeSection}
        historyCount={historyCount}
        user={user}
        onOpenAuth={() => setShowAuthModal(true)}
        onLogout={handleLogout}
      />

      {/* Main Content Viewport */}
      <div className="main-content">
        <div
          className={`main-scrollable ${view !== "home" ? "with-fixed-navbar" : ""}`}
          ref={mainScrollRef}
          onScroll={handleScroll}
        >
          {view === "home" && (
            <LandingPage
              onNavigate={handleNavigate}
              onScrollTo={handleScrollTo}
              mode={mode}
              setMode={setMode}
              onResults={handleResults}
              onError={setError}
              loading={loading}
              setLoading={setLoading}
              onSelectWorkspace={handleSelectWorkspace}
              onOpenLiteratureWithPapers={handleOpenLiteratureWithPapers}
              onOpenDraftWithPapers={handleOpenDraftWithPapers}
              historyCount={historyCount}
              user={user}
              onOpenAuth={() => setShowAuthModal(true)}
            />
          )}

          {view === "results" && results && (
            <ResultsPage
              results={results}
              mode={mode}
              workspaceId={currentWorkspaceId}
              onBack={handleNew}
            />
          )}

          {view === "literature" && (
            <LiteratureReview
              results={results}
              onBack={() => handleNavigate(results ? "results" : "home")}
            />
          )}

          {view === "draft" && (
            <PaperDraft
              results={results}
              onBack={() => handleNavigate(results ? "results" : "home")}
            />
          )}
        </div>
      </div>

      {/* User Login & Sign In Modal (SQLite Database) */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      {/* Global Error Toast */}
      {error && (
        <div className="error-toast">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}
    </div>
  );
}
