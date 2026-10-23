# Research AI Agent — Documentation Index

Research AI Agent is an AI-powered academic research assistant that searches multiple paper databases simultaneously (arXiv, Semantic Scholar, OpenAlex, PubMed), performs deep per-paper analysis using Gemini 1.5 Flash, synthesizes cross-paper themes and contradictions, and generates structured academic literature reviews. Users can also submit PDFs, URLs, or raw text for standalone analysis. All results are saved in file-based workspaces that persist across sessions.

**Tech stack:** Flask 3.0 (backend) + React 18 + Vite 5 (frontend) + Google Gemini API. Single-origin deployment with file-based storage — no database required.

---

## Quick Start

1. Follow the installation steps in [user-guide/getting-started.md](user-guide/getting-started.md) to set up the backend virtual environment, install dependencies, and start both servers.
2. Read [user-guide/features.md](user-guide/features.md) for a guided tour of all analysis modes.
3. Consult [user-guide/faq.md](user-guide/faq.md) if something does not behave as expected.

---

## Navigation Table

### Root-level docs

| Document | Description |
|---|---|
| [README.md](README.md) | This file — documentation index and navigation guide |
| [ENHANCEMENTS.md](ENHANCEMENTS.md) | Backlog of planned feature enhancements |
| [BUGS.md](BUGS.md) | Known bugs and issues with severity and workarounds |
| [PENDING-WORK.md](PENDING-WORK.md) | Incomplete features and work items not yet implemented |
| [TODO.md](TODO.md) | Master actionable checklist combining all open items |

### design/

| Document | Description |
|---|---|
| [design/HLD.md](design/HLD.md) | High-Level Design — system overview, component diagram, data flow |
| [design/LLD.md](design/LLD.md) | Low-Level Design — module internals, class structure, function contracts |
| [design/technical-design.md](design/technical-design.md) | Technical Design Document — architectural decisions and rationale |
| [design/data-models.md](design/data-models.md) | JSON schemas and data structures for workspaces, papers, and results |

### workflows/

| Document | Description |
|---|---|
| [workflows/topic-search-workflow.md](workflows/topic-search-workflow.md) | End-to-end pipeline for topic-based paper search and analysis |
| [workflows/pdf-analysis-workflow.md](workflows/pdf-analysis-workflow.md) | PDF upload and per-document analysis flow |
| [workflows/literature-review-workflow.md](workflows/literature-review-workflow.md) | Literature review generation flow from paper selection to output |
| [workflows/workspace-lifecycle.md](workflows/workspace-lifecycle.md) | Workspace CRUD lifecycle — creation, update, listing, deletion |

### api/

| Document | Description |
|---|---|
| [api/api-reference.md](api/api-reference.md) | REST API endpoint reference — routes, request/response schemas, status codes |
| [api/llm-prompts.md](api/llm-prompts.md) | Gemini prompt catalogue — all prompt templates used in analyzer.py and extractors.py |

### user-guide/

| Document | Description |
|---|---|
| [user-guide/getting-started.md](user-guide/getting-started.md) | Installation and first-run guide |
| [user-guide/features.md](user-guide/features.md) | Feature guide for end users |
| [user-guide/faq.md](user-guide/faq.md) | Frequently asked questions |

### operations/

| Document | Description |
|---|---|
| [operations/deployment.md](operations/deployment.md) | Deployment guide — local, production, and containerised setups |
| [operations/configuration.md](operations/configuration.md) | All configuration options — environment variables, API keys, paths |
| [operations/troubleshooting.md](operations/troubleshooting.md) | Error diagnosis and step-by-step fixes |
| [operations/maintenance.md](operations/maintenance.md) | Routine maintenance tasks — workspace pruning, log rotation, dependency updates |

---

## Audience Guide

| Reader | Start here |
|---|---|
| End user (using the app) | [user-guide/getting-started.md](user-guide/getting-started.md) then [user-guide/features.md](user-guide/features.md) |
| Developer (contributing code) | [design/HLD.md](design/HLD.md) → [design/LLD.md](design/LLD.md) → [api/api-reference.md](api/api-reference.md) |
| Developer (understanding prompts / LLM layer) | [api/llm-prompts.md](api/llm-prompts.md) and [design/technical-design.md](design/technical-design.md) |
| Ops / DevOps (deploying or maintaining) | [operations/deployment.md](operations/deployment.md) → [operations/configuration.md](operations/configuration.md) → [operations/maintenance.md](operations/maintenance.md) |
| Anyone debugging an issue | [BUGS.md](BUGS.md) first, then [operations/troubleshooting.md](operations/troubleshooting.md) |
| Anyone picking up open work | [PENDING-WORK.md](PENDING-WORK.md) and [TODO.md](TODO.md) |

---

## Contributor Context

See [CLAUDE.md](../CLAUDE.md) at the project root for the contributor context file used by Claude Code. It contains project conventions, file layout, key modules, and guidelines for making changes safely.

---

## Docs Maintenance Notes

- When a bug is fixed, remove its row from [BUGS.md](BUGS.md) and check off the corresponding item in [TODO.md](TODO.md).
- When an enhancement is shipped, move it from [ENHANCEMENTS.md](ENHANCEMENTS.md) to a CHANGELOG.md entry.
- When pending work is completed, update the Status column in [PENDING-WORK.md](PENDING-WORK.md) and check off the TODO item.
- All new docs files should be added to the navigation table above.
