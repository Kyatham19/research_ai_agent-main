import React, { useState } from "react";

const API = "";

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [tab, setTab] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    const endpoint = tab === "login" ? `${API}/api/auth/login` : `${API}/api/auth/register`;
    const payload = tab === "login" ? { email, password } : { email, password, name };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed.");
      }

      setSuccessMsg(tab === "login" ? "Welcome back!" : "Account created successfully!");
      setTimeout(() => {
        onAuthSuccess(data);
        onClose();
      }, 400);
    } catch (err) {
      setError(err.message || "An error occurred during authentication.");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoSignIn = async () => {
    setError(null);
    setEmail("researcher@ai.org");
    setPassword("password123");
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "researcher@ai.org", password: "password123" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Demo sign in failed.");
      
      setSuccessMsg("Signed in with Demo Researcher account!");
      setTimeout(() => {
        onAuthSuccess(data);
        onClose();
      }, 400);
    } catch (err) {
      setError(err.message || "Demo sign in failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div className="auth-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button className="auth-close-btn" onClick={onClose} title="Close window">
          ✕
        </button>

        {/* Modal Header */}
        <div className="auth-header">
          <div className="auth-badge">
            <span className="auth-badge-dot" />
            <span>SQLite Database Active</span>
          </div>
          <h2 className="auth-title">
            {tab === "login" ? "Sign In to ResearchAI" : "Create Researcher Account"}
          </h2>
          <p className="auth-subtitle">
            {tab === "login"
              ? "Access your saved papers, literature synthesis matrices, and manuscript drafts."
              : "Register to catalog your research, save custom workspaces, and collaborate."}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${tab === "login" ? "active" : ""}`}
            onClick={() => {
              setTab("login");
              setError(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab ${tab === "register" ? "active" : ""}`}
            onClick={() => {
              setTab("register");
              setError(null);
            }}
          >
            Create Account
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="auth-alert error">
            <span>⚠ {error}</span>
          </div>
        )}
        {successMsg && (
          <div className="auth-alert success">
            <span>✓ {successMsg}</span>
          </div>
        )}

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          {tab === "register" && (
            <div className="auth-field-group">
              <label className="auth-label">Full Name / Academic Title</label>
              <input
                type="text"
                className="auth-input"
                placeholder="e.g. Dr. Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="auth-field-group">
            <label className="auth-label">Email Address</label>
            <input
              type="email"
              className="auth-input"
              placeholder="e.g. researcher@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="auth-field-group">
            <div className="auth-field-header">
              <label className="auth-label">Password</label>
              {tab === "login" && (
                <span className="auth-hint-text">Min 6 characters</span>
              )}
            </div>
            <input
              type="password"
              className="auth-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={loading}
          >
            {loading
              ? "Connecting to Database..."
              : tab === "login"
              ? "Sign In to Workspace ➔"
              : "Create Account & Sign In ➔"}
          </button>
        </form>

        {/* Quick Demo Login Option */}
        <div className="auth-divider">
          <span>OR TEST WITH ONE CLICK</span>
        </div>

        <button
          type="button"
          className="auth-demo-btn"
          onClick={handleDemoSignIn}
          disabled={loading}
        >
          <span className="demo-icon">⚡</span>
          <span>1-Click Demo Sign In (Dr. Alex Morgan)</span>
        </button>

        {/* Footer Database Indicator */}
        <div className="auth-footer-note">
          <span>🔒 Secured with SQLite persistent database & PBKDF2 password hashing</span>
        </div>
      </div>
    </div>
  );
}
