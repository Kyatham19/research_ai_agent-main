# ResearchAI Studio 🔬

> **Autonomous Multi-Agent Academic Intelligence & Literature Synthesis Engine**

🌐 **Live Application**: **[https://research-ai-studio.onrender.com/](https://research-ai-studio.onrender.com/)**

[![Live Demo](https://img.shields.io/badge/Live_Demo-Render_Deployment-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://research-ai-studio.onrender.com/)
[![GitHub](https://img.shields.io/badge/GitHub-Kyatham19%2Fresearch__ai__agent--main-blue?style=for-the-badge&logo=github)](https://github.com/Kyatham19/research_ai_agent-main)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

ResearchAI Studio accelerates scientific discovery by retrieving literature across millions of publications (arXiv, PubMed, Semantic Scholar, OpenAlex), analyzing empirical findings, generating thematic literature reviews, and drafting publication-ready academic manuscripts.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Kyatham19/research_ai_agent-main)

---

## ✨ Features

- **🌐 Multi-Source Academic Retrieval**:
  - Search by research topic with an interactive paper depth slider (1–15 papers).
  - Ingest direct arXiv, PubMed, or open web URLs.
  - Upload PDF manuscripts for automated extraction.
  - Paste raw academic text and abstracts.
- **📊 Comparative Analysis & Extraction**:
  - Isolates research problems, methodologies, main contributions, limitations, and future research trajectories.
  - Computes corpus volume, syntactic breadth, lexical density, and mean sentence length.
  - Interactive comparative matrix across retrieved papers.
- **📚 Dedicated Literature Review Studio**:
  - Thematic grouping and cross-paper synthesis.
  - Multi-paper comparative summary tables.
  - Export reviews directly to Markdown, Word, or PDF.
- **📝 Publication-Ready Paper Draft Builder**:
  - Generates complete research paper drafts with Abstract, Introduction, Related Work, Methodology, Results & Discussion, Conclusion, and formatted References.
  - Zero-hallucination inline academic citation grounding.
- **🔒 Multi-User SQLite Persistent Database**:
  - User authentication with PBKDF2 password hashing & Bearer token sessions.
  - User-isolated workspace history and starred favorites.
  - Fast 1-Click Guest & Demo access.
- **🎨 Modern Scientific UI / Dual Theme System**:
  - Refined **Obsidian & Electric Indigo** dark mode.
  - Clean **Swiss / Slate Editorial** high-contrast light mode.
  - Live scroll-spy top navbar with frosted glass backdrop blur and tactile micro-interactions.

---

## 🏛️ Architecture

```
research_ai_agent/
├── backend/
│   ├── app.py                # Flask API server (Port 5000)
│   ├── database.py           # SQLite user authentication & workspaces
│   ├── analyzer.py           # Paper text parsing & heuristic extraction
│   ├── extractors.py         # arXiv, PubMed, OpenAlex & PDF ingestion
│   ├── literature_review.py  # Thematic review synthesizer
│   ├── paper_draft.py        # Publication manuscript draft builder
│   ├── llm.py                # Google Gemini 2.5 Flash API wrapper
│   └── requirements.txt      # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── pages/            # LandingPage, ResultsPage, LiteratureReview, PaperDraft, HistoryPage
│   │   ├── components/       # Header, AuthModal, ResultsPanel, InputPanel, Sidebar
│   │   ├── App.jsx           # Root orchestrator, routing & scroll spy
│   │   └── App.css           # Complete design system & dual color themes
│   ├── vite.config.js        # Vite dev server & API proxy (Port 3000)
│   └── package.json          # React dependencies
└── scripts/
    └── start-all.bat         # 1-Click full stack launcher for Windows
```

---

## 🚀 Quick Start (Local Setup)

### Prerequisites
- Python 3.10+
- Node.js 18+

### 1. 1-Click Windows Launcher
Double-click `scripts\start-all.bat` or run:
```cmd
scripts\start-all.bat
```
This automatically boots:
- Flask Backend at `http://localhost:5000`
- Vite Frontend at `http://localhost:3000`

---

### 2. Manual Setup

#### Backend Setup
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Edit .env and optionally add your GEMINI_API_KEY from https://aistudio.google.com/
python app.py
```

#### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open **http://localhost:3000** in your browser.

---

## 🌐 Deployment Guide

### Option A: Render (Backend) + Vercel (Frontend)
1. **Backend on Render**:
   - Create a new **Web Service** pointing to your repository.
   - Root directory: `backend`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn app:app`
   - Add Environment Variable: `GEMINI_API_KEY` (optional)
2. **Frontend on Vercel**:
   - Create a new project pointing to your repository.
   - Root directory: `frontend`
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`

### Option B: Monolithic Deployment (Single Server / Railway / Docker)
Run `npm run build` inside `frontend/`. The production bundle compiles to `frontend/dist`. Flask automatically serves the built frontend from `backend/app.py` on `http://localhost:5000`.

---

## 📄 License
MIT License. See [LICENSE](LICENSE) for details.
