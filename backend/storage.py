"""
storage.py — Workspace persistence layer
Handles all read/write operations for workspaces using JSON files.

Folder layout per workspace:
  data/workspaces/workspace_<id>/
    metadata.json   — query, timestamps, favorite flag
    papers.json     — retrieved papers list
    analyses.json   — NLP analysis results
    ideas.json      — generated research ideas
    chat.json       — chat message history
    uploads/        — uploaded PDF files (binary)
"""

import os
import json
import uuid
import shutil
from datetime import datetime

# ── Path helpers ─────────────────────────────────────────────────────────────

BASE_DIR = os.path.join(os.path.dirname(__file__), "data", "workspaces")


def _ws_dir(workspace_id: str) -> str:
    return os.path.join(BASE_DIR, f"workspace_{workspace_id}")


def _ws_file(workspace_id: str, filename: str) -> str:
    return os.path.join(_ws_dir(workspace_id), filename)


def _uploads_dir(workspace_id: str) -> str:
    return os.path.join(_ws_dir(workspace_id), "uploads")


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


# ── Low-level JSON helpers ────────────────────────────────────────────────────

def _read_json(path: str, default):
    """Read JSON file safely; return default if missing or corrupt."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def _write_json(path: str, data) -> None:
    """Write data to JSON file, creating parent dirs as needed."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# ── Workspace CRUD ────────────────────────────────────────────────────────────

def create_workspace(query: str, user_id: int | None = None, user_email: str | None = None) -> dict:
    """
    Create a new workspace for a search query.
    Associates with user_id and user_email if authenticated.
    Returns the full metadata dict.
    """
    workspace_id = str(uuid.uuid4())[:8]  # short 8-char ID
    now = _now()

    metadata = {
        "id": workspace_id,
        "query": query,
        "created_at": now,
        "last_opened": now,
        "favorite": False,
        "paper_count": 0,
        "mode": "topic",
        "user_id": user_id,
        "user_email": user_email
    }

    # Create workspace directory and uploads subfolder
    os.makedirs(_uploads_dir(workspace_id), exist_ok=True)

    # Write initial files
    _write_json(_ws_file(workspace_id, "metadata.json"), metadata)
    _write_json(_ws_file(workspace_id, "papers.json"),   [])
    _write_json(_ws_file(workspace_id, "analyses.json"), [])
    _write_json(_ws_file(workspace_id, "combined.json"), {})
    _write_json(_ws_file(workspace_id, "ideas.json"),    [])
    _write_json(_ws_file(workspace_id, "chat.json"),     [])

    return metadata


def list_workspaces(user_id: int | None = None, allowed_ids: set | None = None) -> list:
    """
    Return workspaces filtered for the authenticated user.
    - If user_id is provided: returns only workspaces owned by that user.
    - If user_id is None: returns only unowned/guest workspaces.
    Sorted by last_opened descending.
    """
    workspaces = []

    if not os.path.exists(BASE_DIR):
        return []

    for folder in os.listdir(BASE_DIR):
        folder_path = os.path.join(BASE_DIR, folder)
        if not os.path.isdir(folder_path):
            continue

        meta_path = os.path.join(folder_path, "metadata.json")
        metadata = _read_json(meta_path, None)

        if metadata and "id" in metadata:
            ws_user_id = metadata.get("user_id")
            ws_id = metadata.get("id")

            if user_id is not None:
                # Logged-in user: match user_id or sqlite allowed_ids
                if ws_user_id == user_id or (allowed_ids and ws_id in allowed_ids):
                    workspaces.append(metadata)
            else:
                # Guest / Unauthenticated session: only show unclaimed guest workspaces
                if ws_user_id is None:
                    workspaces.append(metadata)

    # Sort by last_opened descending (most recent first)
    workspaces.sort(key=lambda w: w.get("last_opened", ""), reverse=True)
    return workspaces


def load_workspace(workspace_id: str, user_id: int | None = None) -> dict | None:
    """
    Load full workspace data including papers, analyses, ideas, chat.
    Enforces user isolation if workspace is claimed by another user.
    Returns None if workspace does not exist or unauthorized.
    """
    ws_dir = _ws_dir(workspace_id)
    if not os.path.exists(ws_dir):
        return None

    metadata  = _read_json(_ws_file(workspace_id, "metadata.json"), None)
    if not metadata:
        return None

    # Check user ownership if claimed
    ws_user_id = metadata.get("user_id")
    if ws_user_id is not None and user_id is not None and ws_user_id != user_id:
        return None

    return {
        "metadata":  metadata,
        "papers":    _read_json(_ws_file(workspace_id, "papers.json"),   []),
        "analyses":  _read_json(_ws_file(workspace_id, "analyses.json"), []),
        "combined":  _read_json(_ws_file(workspace_id, "combined.json"), {}),
        "ideas":     _read_json(_ws_file(workspace_id, "ideas.json"),    []),
        "chat":      _read_json(_ws_file(workspace_id, "chat.json"),     []),
    }


def delete_workspace(workspace_id: str, user_id: int | None = None) -> bool:
    """Delete a workspace folder entirely. Checks user ownership. Returns True if deleted."""
    ws_dir = _ws_dir(workspace_id)
    if not os.path.exists(ws_dir):
        return False

    if user_id is not None:
        metadata = _read_json(_ws_file(workspace_id, "metadata.json"), None)
        if metadata and metadata.get("user_id") is not None and metadata.get("user_id") != user_id:
            return False

    shutil.rmtree(ws_dir)
    return True


# ── Save helpers ──────────────────────────────────────────────────────────────

def save_papers(workspace_id: str, papers: list) -> None:
    """Save retrieved papers and update paper_count in metadata."""
    _write_json(_ws_file(workspace_id, "papers.json"), papers)

    # Update paper count in metadata
    meta_path = _ws_file(workspace_id, "metadata.json")
    metadata = _read_json(meta_path, {})
    metadata["paper_count"] = len(papers)
    _write_json(meta_path, metadata)


def save_analyses(workspace_id: str, analyses: list) -> None:
    """Save NLP analysis results."""
    _write_json(_ws_file(workspace_id, "analyses.json"), analyses)


def save_combined(workspace_id: str, combined: dict) -> None:
    """Save the multi-paper combined analysis separately from individual analyses."""
    _write_json(_ws_file(workspace_id, "combined.json"), combined)


def save_ideas(workspace_id: str, ideas: list) -> None:
    """Save generated research ideas."""
    _write_json(_ws_file(workspace_id, "ideas.json"), ideas)


def save_chat_message(workspace_id: str, role: str, content: str) -> dict:
    """
    Append a single message to chat history.
    role: 'user' or 'assistant'
    Returns the new message dict.
    """
    chat_path = _ws_file(workspace_id, "chat.json")
    messages = _read_json(chat_path, [])

    message = {
        "id":        str(uuid.uuid4())[:8],
        "role":      role,
        "content":   content,
        "timestamp": _now()
    }

    messages.append(message)
    _write_json(chat_path, messages)
    return message


def save_uploaded_file(workspace_id: str, filename: str, file_bytes: bytes) -> str:
    """Save an uploaded PDF file to the workspace uploads folder."""
    uploads = _uploads_dir(workspace_id)
    os.makedirs(uploads, exist_ok=True)
    dest = os.path.join(uploads, filename)
    with open(dest, "wb") as f:
        f.write(file_bytes)
    return dest


# ── Metadata updates ──────────────────────────────────────────────────────────

def toggle_favorite(workspace_id: str) -> bool:
    """Toggle favorite status. Returns new favorite value."""
    meta_path = _ws_file(workspace_id, "metadata.json")
    metadata = _read_json(meta_path, {})
    metadata["favorite"] = not metadata.get("favorite", False)
    _write_json(meta_path, metadata)
    return metadata["favorite"]


def update_last_opened(workspace_id: str) -> None:
    """Update last_opened timestamp to now."""
    meta_path = _ws_file(workspace_id, "metadata.json")
    metadata = _read_json(meta_path, {})
    metadata["last_opened"] = _now()
    _write_json(meta_path, metadata)


def update_metadata(workspace_id: str, updates: dict) -> None:
    """Merge arbitrary key/value updates into metadata."""
    meta_path = _ws_file(workspace_id, "metadata.json")
    metadata = _read_json(meta_path, {})
    metadata.update(updates)
    _write_json(meta_path, metadata)
