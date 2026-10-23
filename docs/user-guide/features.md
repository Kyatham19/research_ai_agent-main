# Features Guide

This guide covers every feature in Research AI Agent in detail. Each section explains what the feature does, how to use it step by step, what output to expect, and any tips or limitations worth knowing.

---

## Table of Contents

1. [Topic Research](#1-topic-research)
2. [PDF Analysis](#2-pdf-analysis)
3. [URL Analysis](#3-url-analysis)
4. [Raw Text Analysis](#4-raw-text-analysis)
5. [Literature Review Generator](#5-literature-review-generator)
6. [Paper Draft Builder](#6-paper-draft-builder)
7. [Workspace Management](#7-workspace-management)
8. [Chat per Workspace](#8-chat-per-workspace)
9. [Dark / Light Theme](#9-dark--light-theme)

---

## 1. Topic Research

### What it does

Topic Research is the core feature of the app. You provide a research topic in plain language, and the app automatically searches four major academic databases at once, retrieves the most relevant papers, and produces a deep analysis of each one along with a synthesized overview of the entire field.

### How to use it

**Step 1 — Select Topic mode**
On the main input page, make sure the **Topic** tab is selected (it is the default).

**Step 2 — Enter your topic**
Type your research topic in the text box. You do not need to use formal academic language — plain descriptions work well. Examples:

- `attention mechanisms in natural language processing`
- `CRISPR gene editing for sickle cell disease`
- `federated learning for privacy-preserving healthcare AI`

The more specific your topic, the more targeted the results. If your topic is very narrow and returns few results, try broadening it slightly (see the FAQ for tips).

**Step 3 — Set the number of papers**
Use the paper count control to choose how many papers to retrieve and analyze. The range is 1 to 20, with a default of 5.

> **Tip:** Start with 5 papers to get a quick overview of a field. Once you know which directions interest you, run a second, more specific search with 10 to 15 papers.

**Step 4 — Start the analysis**
Click the **Analyze** button. A progress indicator will appear while the app works.

**Step 5 — Review results**
When the analysis finishes, the results page displays all findings. Scroll through the sections or use any navigation provided.

### What the app does behind the scenes

The app expands your topic into multiple search query variants, then queries arXiv, Semantic Scholar, OpenAlex, and PubMed simultaneously. Each returned paper is scored on four factors:

- **Semantic similarity** to your topic
- **Citation count** (more-cited papers rank higher)
- **Recency** (newer papers get a boost)
- **Source authority** (well-established databases score higher)

The highest-scoring papers are selected for deep analysis.

### What output to expect

For each paper you will see:

| Output Section | What It Contains |
|---|---|
| Executive Summary | Plain-language overview of what the paper is about |
| Research Problem | The specific gap or question the paper addresses |
| Methodology | How the study was conducted |
| Key Contributions | What the paper adds to the field |
| Gaps & Limitations | What the paper does not address or where it falls short |
| Future Scope | Directions the authors or the AI suggest for follow-up work |
| Keywords | Important terms associated with the paper |

After the individual paper sections, a **Combined Synthesis** section covers:
- Common themes across all papers
- Methodological comparisons
- Areas of agreement and disagreement in the literature
- Research trends over time
- An assessment of how mature the field is

### Tips and limitations

- Analysis time scales with the number of papers. Five papers typically takes 30 to 60 seconds. Twenty papers may take several minutes.
- Very niche sub-topics may return zero results. If this happens, try a slightly broader phrasing.
- Results are saved automatically. You do not need to manually save anything.

---

## 2. PDF Analysis

### What it does

PDF Analysis lets you upload one or more PDF files — such as papers you have already downloaded — and runs the same deep analysis on them that Topic Research uses. You are not limited to papers the app can find online; you can analyze any PDF.

### How to use it

**Step 1 — Select PDF mode**
Click the **PDF** tab on the main input page.

**Step 2 — Upload your file(s)**
Either drag and drop PDF files into the upload area, or click the area to open a file picker. You can select one file or multiple files at once.

**Step 3 — Start the analysis**
Click the **Analyze** button. The app extracts the text from each PDF and sends it for analysis.

**Step 4 — Review results**
For a single PDF, you will see the same individual analysis output described in Topic Research above.

For multiple PDFs, you will see:
- An individual analysis for each uploaded file
- A cross-document analysis comparing and synthesizing findings across all uploaded papers

### What output to expect

Each PDF produces the full individual analysis (executive summary, methodology, contributions, gaps, future scope, keywords). When multiple PDFs are uploaded together, the additional cross-document analysis covers shared themes, methodological differences, and areas of agreement and disagreement across the files.

Uploaded files are saved into the workspace's uploads folder so you can retrieve them alongside the analysis results.

### Tips and limitations

- **Text-based PDFs only.** The app extracts text directly from the PDF file. Scanned PDFs — such as older papers photographed and converted to PDF — do not contain machine-readable text, so the app will return little or no content from them. If you need to analyze a scanned paper, try finding a publisher's digital version or an arXiv preprint instead.
- File size limits depend on your system's available memory, but most standard research papers (under 10 MB) work without any issues.
- If you are on Python 3.14 and PyMuPDF is unavailable, the app uses a fallback extractor that is slightly slower but equally accurate.

---

## 3. URL Analysis

### What it does

URL Analysis lets you paste any web address pointing to a research paper or article, and the app will fetch the page, extract the relevant text, and run a full analysis on it. This is useful for papers you find while browsing that you want to analyze immediately without downloading them.

### How to use it

**Step 1 — Select URL mode**
Click the **URL** tab on the main input page.

**Step 2 — Paste the URL**
Paste the full web address of the paper. Examples of what works well:

- An arXiv abstract page: `https://arxiv.org/abs/2310.12345`
- A journal article page with accessible full text
- A preprint server page

**Step 3 — Start the analysis**
Click **Analyze**. The app fetches the page, removes navigation menus, sidebars, and other HTML clutter, and extracts the plain text of the article.

**Step 4 — Review results**
Results follow the same format as Topic Research — executive summary, methodology, contributions, gaps, future scope, and keywords.

### What output to expect

The analysis output is identical to what you see for a single paper in Topic Research or PDF Analysis. The source will be noted as the URL you provided.

### Tips and limitations

- **arXiv URLs are handled automatically.** If you paste an arXiv PDF link (ending in `/pdf/...`), the app redirects to the abstract page, which contains the structured metadata and abstract text best suited for analysis.
- The app can only read pages that are publicly accessible. Papers behind paywalls will not produce meaningful results — use the PDF Analysis feature instead if you have a downloaded copy.
- Pages with heavy JavaScript rendering (where content only appears after scripts run) may not be fully captured. Most academic paper pages work correctly.

---

## 4. Raw Text Analysis

### What it does

Raw Text Analysis is the simplest and fastest mode. You paste any piece of research text — an abstract, an excerpt, a methods section, a passage from a paper — and the app analyzes it immediately, without making any calls to paper databases or fetching any external content.

### How to use it

**Step 1 — Select Text mode**
Click the **Text** tab on the main input page.

**Step 2 — Paste your text**
Paste any research text into the input box. This could be:
- An abstract you copied from a paper
- A key excerpt from a methods section
- A summary you wrote yourself that you want the AI to analyze
- Any other research-related text

**Step 3 — Start the analysis**
Click **Analyze**. Because the app does not need to fetch any external content, results appear more quickly than other modes.

### What output to expect

You will see the same individual analysis format: executive summary, research problem, methodology notes, contributions, gaps, limitations, and keywords — all derived from the text you provided.

### Tips and limitations

- This mode is ideal for quick spot-checks on a passage or abstract.
- Results are only as good as the text you provide. A short abstract will produce a less detailed analysis than a full methods section.
- This mode is the fastest of all four input types, making it good for iterative exploration.

---

## 5. Literature Review Generator

### What it does

The Literature Review Generator takes a set of papers you select and produces a formal, structured academic literature review — the kind you would include in a thesis, journal submission, or research proposal. Unlike a simple summary, the generated review is written as a scholarly argument that synthesizes findings across all selected papers into a coherent narrative.

### How to use it

**Step 1 — Accumulate papers first**
The Literature Review Generator works from papers already analyzed in your workspaces. If you have not done any analyses yet, run a Topic Search or PDF Analysis first. You need at least two papers.

**Step 2 — Open the Literature Review panel**
Click **Literature Review** in the sidebar. A panel will open showing papers available from your workspaces.

**Step 3 — Select your papers**
Check the boxes next to the papers you want to include in the review. You can mix papers from different workspaces. Select at least 2 papers (there is no hard upper limit, but 5 to 15 papers produces the most coherent reviews).

**Step 4 — Generate the review**
Click the **Generate** button. The AI will take a moment to compose the review.

**Step 5 — Read and use the review**
The generated review appears in the main content area. You can read it directly in the app, or copy the text for use in your own documents.

### What output to expect

The generated literature review contains eight sections:

| Section | Contents |
|---|---|
| Introduction | Framing of the topic and scope of the review |
| Background | Context and foundational concepts needed to understand the field |
| Thematic Analysis | Major themes that emerge across the selected papers |
| Methodology Comparison | Side-by-side discussion of how different papers approached the problem |
| Dataset & Evaluation Landscape | What datasets and metrics were used across the papers |
| Research Trends | How the field has evolved over the papers' publication dates |
| Research Gaps & Future Directions | What remains unanswered and where future work should go |
| Conclusion | Summary of the state of the field |

A **summary table** comparing all selected papers side by side is also included, covering key attributes such as methods used, datasets, and main findings.

> **Important:** The review is written as a synthesized scholarly argument, not as a paper-by-paper description. The AI identifies connections, tensions, and progressions across the literature rather than simply listing what each paper says.

### Editing the review

After the review is generated, every section — including all text paragraphs and every cell in the summary table — is directly editable in the browser. Click on any text and start typing. Your edits are preserved as long as you keep the page open.

### Tips and limitations

- A minimum of 2 papers is required. The quality and depth of the review increases significantly with more papers.
- Papers from multiple workspaces can be combined in a single review.
- The generated text is a starting point for your own writing — treat it as a detailed first draft that you review, edit, and verify against the source papers.
- Generation time increases with the number of papers selected.

---

## 6. Paper Draft Builder

### What it does

The Paper Draft Builder generates a complete, publication-quality research paper draft based on papers you have already analyzed and configuration you provide. It is designed to help you move from a literature survey to a draft manuscript quickly.

The draft is structured like a real academic paper — with an abstract, introduction, related work, methodology, results and discussion, conclusion, and references — written in formal academic style with proper in-text citations to the reference papers you select.

### How to use it

**Step 1 — Open the Paper Draft panel**
Click **Paper Drafts** in the sidebar.

**Step 2 — Select your reference papers**
Click **Load Workspaces** to see papers from your saved workspaces. Check the boxes next to the papers you want to use as references for the draft. The system uses up to 2 papers as references (free-tier API constraint).

Click **Next: Configure Draft** to proceed.

**Step 3 — Configure the paper**
Fill in the configuration form:

| Field | Required | Description |
|---|---|---|
| Title | Yes | The working title for your paper |
| Research Question / Objective | Yes | The core question or goal your paper addresses |
| Proposed Methodology | No | Your method or approach. If left blank, the AI infers one from the references |
| Key Contributions | No | What your paper contributes. If left blank, the AI infers from gaps in the references |
| Target Venue | No | Target journal or conference (e.g., "CVPR", "IEEE TPAMI") |

Below the form, check which sections you want generated. All 7 sections are pre-selected by default:
- Abstract
- Introduction
- Related Work
- Methodology
- Results & Discussion
- Conclusion
- References

**Step 4 — Generate the draft**
Click **✨ Generate Paper Draft (up to 2 references)**. Generation takes 20–60 seconds as a single large Gemini call.

**Step 5 — Edit and export**
The generated draft is displayed as tabbed sections. Each tab's content is directly editable — click into any section and type to revise. When you are satisfied:

- **Export to PDF:** Click the PDF button to open a print dialog. Use "Print to PDF" to save.
- **Export to Word:** Click the Word button to download a `.docx` file.

### What output to expect

Each generated section contains 3–5 substantive paragraphs of academic prose, with citations to the reference papers formatted as `[FirstAuthor et al., Year]`. The references section lists all cited papers in standard format.

### Tips and limitations

- **Rate limits:** The Paper Draft calls Gemini once with a large output request. On the free tier, if you have been running many topic searches recently, you may see a "rate limit exceeded" error. Wait about a minute and try again, or change your API key.
- **2-paper cap:** Only the first 2 selected papers are used as references. The draft will cite these two papers; it will not synthesize more sources than that unless you manually edit the draft.
- **Draft quality:** The AI produces a structured, coherent draft, but it should be treated as a starting point. Verify all factual claims against the source papers, and revise the methodology and results sections to reflect your actual experimental plan.
- **No real experiments:** The results and discussion section describes proposed experiments and expected outcomes — it does not contain real experimental data. This is a draft for a planned paper, not a completed study.

---

## 7. Workspace Management

### What it does

Every time you run an analysis, the app automatically saves all results — the papers found, their analyses, the synthesis, and any uploaded files — to a **workspace**. Workspaces let you return to any previous analysis at any time, organize your research, and build up a library of analyzed papers over time.

### How workspaces are created

You do not need to do anything to create a workspace. As soon as an analysis completes, a workspace is created and named automatically. The workspace name reflects the topic or input you used.

### How to use workspace management

**Viewing past workspaces**
The sidebar on the left side of the app lists all your workspaces, sorted by the date they were last opened. Click any workspace name to reload its full results.

**Starring a workspace**
Click the star icon next to a workspace to mark it as a favorite. Starred workspaces appear at the top of the list for quick access. Click the star again to remove the favorite.

**Deleting a workspace**
Click the delete (trash) icon next to a workspace to remove it. This deletes all associated data, including uploaded PDFs. This action cannot be undone.

**Searching workspaces**
If you have many workspaces, use the search or filter controls in the sidebar to find the one you need.

### Where data is stored

All workspace data is stored locally on your computer at:

```
backend/data/workspaces/
```

Each workspace is a folder named `workspace_<id>/` and contains JSON files with the analysis results and a subfolder for any uploaded PDFs.

### Tips and limitations

- Workspaces accumulate over time. Periodically delete workspaces you no longer need to keep the sidebar manageable.
- Because data is stored locally, it is not backed up automatically. If you want to back up your research, copy the `backend/data/workspaces/` folder to another location.
- To start completely fresh, see the FAQ for instructions on clearing all workspace data.

---

## 8. Chat per Workspace

### What it does

Each workspace has an associated chat log that records conversations related to that workspace's research. This feature is designed for asking follow-up questions about the papers in a workspace, exploring ideas raised by the analysis, or keeping notes tied to a specific research session.

### Current availability

The chat log for each workspace is stored in a `chat.json` file alongside the analysis data. The chat interface is accessible via the API and is planned for the main UI in a future update. If you are a developer, you can interact with it via the API endpoints documented in the API reference.

### Where chat data is stored

```
backend/data/workspaces/workspace_<id>/chat.json
```

---

## 9. Dark / Light Theme

### What it does

Research AI Agent supports both a dark theme and a light theme. You can switch between them at any time without affecting your analysis results or workspace data.

### How to use it

Click the theme toggle button in the sidebar (it typically shows a sun or moon icon). The app switches immediately between dark and light mode.

Your preference is saved in your browser's local storage, so the app remembers which theme you chose the next time you open it in the same browser.

### Tips

- The theme setting is browser-specific. If you open the app in a different browser or a private window, it will revert to the default.
- Theme preference is entirely local — it is not saved to a workspace or synced anywhere.
