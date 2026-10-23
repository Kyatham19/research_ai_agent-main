import React, { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './App.css'
import App from './App.jsx'

class GlobalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Global Error Caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px 24px',
          maxWidth: '720px',
          margin: '60px auto',
          background: '#131317',
          border: '1px solid #6366f1',
          borderRadius: '12px',
          color: '#e2e8f0',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>🔄</div>
          <h2 style={{ color: '#fff', margin: '0 0 10px', fontSize: '20px' }}>Application Updated</h2>
          <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.6, margin: '0 0 20px' }}>
            New components were loaded. Click below to load the fresh view:
          </p>
          <button
            onClick={() => {
              sessionStorage.clear();
              window.location.href = window.location.origin + window.location.pathname + '?r=' + Date.now();
            }}
            style={{
              padding: '11px 24px',
              borderRadius: '8px',
              background: '#4f46e5',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '14px',
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.4)'
            }}
          >
            Load Updated ResearchAI ➔
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </StrictMode>,
)