# Getting Started with Research AI Agent

Welcome to Research AI Agent — an AI-powered tool that helps you search, analyze, and synthesize academic literature in minutes. This guide walks you through everything you need to get up and running for the first time.

---

## Prerequisites

Before installing, make sure the following software is available on your machine.

| Software | Minimum Version | Where to Get It |
|---|---|---|
| Python | 3.8 or higher | [python.org/downloads](https://www.python.org/downloads/) |
| Node.js | 18 or higher | [nodejs.org](https://nodejs.org/) |
| Git (optional) | Any recent version | [git-scm.com](https://git-scm.com/) |
| Gemini API Key | — (free tier available) | [aistudio.google.com](https://aistudio.google.com/) |

**How to check what you already have:**

Open a terminal (Command Prompt, PowerShell, or macOS Terminal) and run:

```
python --version
node --version
```

If either command returns "not found" or a version lower than required, install or upgrade that software before continuing.

**Getting your Gemini API key:**

1. Go to [aistudio.google.com](https://aistudio.google.com/) and sign in with a Google account.
2. Click **Get API key** in the left sidebar.
3. Click **Create API key** and copy the key shown. Keep it safe — you will need it in Step 5 below.

---

## Installation

Follow these steps in order. Each step must be completed before moving to the next.

### Step 1 — Download the project

If you have Git installed:

```
git clone <repository-url>
cd research-analyzer
```

If you downloaded a ZIP file, extract it and open a terminal inside the extracted folder.

### Step 2 — Set up the Python environment

Navigate into the `backend` folder and create a virtual environment. A virtual environment keeps the project's dependencies separate from your system Python installation.

```
cd backend
python -m venv venv
```

Now activate the virtual environment:

**On Windows:**
```
venv\Scripts\activate
```

**On macOS or Linux:**
```
source venv/bin/activate
```

You will know the environment is active when your terminal prompt shows `(venv)` at the beginning of the line.

### Step 3 — Install Python dependencies

With the virtual environment active, install the required packages:

```
pip install flask==3.0.0 flask-cors==4.0.0 pdfminer.six==20221105 requests==2.31.0 google-generativeai==0.7.2 python-dotenv==1.0.0
```

This command installs everything the backend needs to run. It may take a minute or two.

> **Optional — faster PDF parsing (Python 3.11 and below only):**
> If you are on Python 3.11 or lower and want faster PDF processing, you can also install:
> ```
> pip install pymupdf==1.23.8
> ```
> This step is optional — the app works perfectly without it.

---

> ### Known Issue — Python 3.14 and PyMuPDF
>
> **Symptom:** `pip install pymupdf` fails with a build error.
>
> **Cause:** PyMuPDF cannot currently be compiled from source on Python 3.14.
>
> **Impact:** None. The app automatically detects this and falls back to `pdfminer.six` for PDF text extraction. PDF uploads continue to work normally, though processing may be slightly slower on very large files.
>
> **Resolution:** No action required. If you prefer faster PDF parsing, use Python 3.11 or lower.

---

### Step 4 — Configure your API key

Create a file named `.env` inside the `backend/` folder. Open any text editor, paste the following line, replace the placeholder with your actual key, and save the file as `backend/.env`:

```
GEMINI_API_KEY=your_api_key_here
```

**Important notes:**
- Do not add quotation marks around the key value.
- The file must be named `.env` (with the dot), not `env.txt` or anything else.
- This file stays on your computer and is never uploaded anywhere.

### Step 5 — Build the frontend

The user interface is a React application that must be compiled once before use. Open a new terminal tab (or navigate out of `backend/`) and run:

```
cd ../frontend
npm install
npm run build
```

`npm install` downloads the frontend's dependencies and may take a few minutes the first time. `npm run build` compiles the interface into the `frontend/dist/` folder, which the server then serves.

### Step 6 — Start the server

Go back to the `backend/` folder (with the virtual environment still active) and start the server:

```
cd ../backend
python app.py
```

You should see output similar to:

```
 * Running on http://127.0.0.1:5000
 * Running on http://0.0.0.0:5000
```

The server is now running. Leave this terminal window open while you use the app.

### Step 7 — Open the app

Open your web browser and go to:

```
http://localhost:5000
```

The Research AI Agent interface should load. You are ready to start analyzing research.

---

## Verifying the Installation

Before running your first real analysis, confirm that each component is working correctly.

**Check 1 — The interface loads**
Navigate to `http://localhost:5000`. You should see the Research AI Agent home screen with an input area and a sidebar.

**Check 2 — The backend responds**
In your browser, open a new tab and go to `http://localhost:5000/health` (or `http://localhost:5000/`). You should get a response rather than a connection error.

**Check 3 — The API key is recognized**
If the API key is missing or incorrect, the app will show an error message when you try to run an analysis. If this happens, re-read Step 4 and confirm the `.env` file is in the `backend/` folder with the correct key and no extra spaces or quotes.

---

## Your First Analysis

Once the app is running, here is a quick walkthrough to run your first topic search.

**1. Open the input page**

The main screen shows an input area in the center. You should see options for Topic, PDF, URL, and Text analysis modes.

**2. Choose Topic mode**

Click the **Topic** tab (this is the default mode when you open the app).

**3. Enter a research topic**

Type a descriptive topic in the search box. Be specific — the more detail you provide, the more relevant your results will be. For example:

> `transformer models for medical image segmentation`

**4. Set the number of papers**

Below the topic field, there is a slider or input for the number of papers to retrieve. The default is 5. For your first search, leave it at 5 to keep the analysis quick.

**5. Start the analysis**

Click the **Analyze** or **Search** button. The app will:
- Expand your topic into search queries
- Search arXiv, Semantic Scholar, OpenAlex, and PubMed simultaneously
- Score each paper for relevance
- Run a deep analysis on the most relevant papers
- Synthesize findings across all papers

This typically takes 30 to 60 seconds for 5 papers.

**6. Review your results**

When the analysis completes, you will see:
- A list of papers found, each with an executive summary, methodology notes, key contributions, gaps, and limitations
- A combined synthesis section covering shared themes, trends, and research opportunities

Your results are automatically saved to a workspace. You can find them again at any time in the sidebar under **Recent Workspaces**.

---

## Where Your Data Lives

All analysis results, uploaded files, and workspace history are stored locally on your machine at:

```
backend/data/workspaces/
```

Nothing is sent to any cloud storage service. Your research data stays entirely on your computer.

---

## Next Steps

- Read the [Features Guide](./features.md) for a detailed walkthrough of every feature, including PDF upload, URL analysis, and literature review generation.
- Check the [FAQ](./faq.md) if you run into any issues during installation or use.
