"""
database.py — SQLite Database Layer for User Authentication & Management
Handles persistent user accounts, hashed passwords, and active session tokens.
Database is stored at: backend/data/research_agent.db
"""

import os
import sqlite3
import secrets
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

DB_DIR = os.path.join(os.path.dirname(__file__), "data")
DB_PATH = os.path.join(DB_DIR, "research_agent.db")


def get_db():
    """Connect to SQLite database with foreign keys enabled and row factory set."""
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Initialize database tables and seed demo research user if fresh."""
    os.makedirs(DB_DIR, exist_ok=True)
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. Users Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL COLLATE NOCASE,
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT DEFAULT 'researcher',
                created_at TEXT NOT NULL
            )
        """)
        
        # 2. Session Tokens Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tokens (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            )
        """)

        # 3. Workspaces Association Table (optional link to user)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_workspaces (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                workspace_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (user_id, workspace_id)
            )
        """)
        
        conn.commit()

        # Seed initial demo account if table is empty
        cursor.execute("SELECT COUNT(*) as count FROM users")
        row = cursor.fetchone()
        if row and row["count"] == 0:
            demo_email = "researcher@ai.org"
            demo_pass = "password123"
            demo_hash = generate_password_hash(demo_pass)
            now = datetime.utcnow().isoformat() + "Z"
            cursor.execute(
                "INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
                (demo_email, "Dr. Alex Morgan", demo_hash, "lead_scientist", now)
            )
            conn.commit()
            print(f"[Database] SQLite DB initialized at {DB_PATH} with demo user: {demo_email}")

        # Seed link for demo user to sample workspace if table empty
        cursor.execute("SELECT id FROM users WHERE email = 'researcher@ai.org'")
        demo_u = cursor.fetchone()
        if demo_u:
            cursor.execute(
                "INSERT OR IGNORE INTO user_workspaces (user_id, workspace_id, created_at) VALUES (?, '297bda88', ?)",
                (demo_u["id"], datetime.utcnow().isoformat() + "Z")
            )
            conn.commit()


def register_user(email: str, password: str, name: str) -> dict:
    """Register a new user account and return (user_dict, token)."""
    email = email.strip().lower()
    name = name.strip() or "Researcher"
    
    if not email or "@" not in email:
        raise ValueError("Please provide a valid email address.")
    if not password or len(password) < 6:
        raise ValueError("Password must be at least 6 characters long.")
        
    pwd_hash = generate_password_hash(password)
    now = datetime.utcnow().isoformat() + "Z"
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
        if cursor.fetchone():
            raise ValueError("An account with this email address already exists. Please sign in.")
            
        cursor.execute(
            "INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, ?, ?, 'researcher', ?)",
            (email, name, pwd_hash, now)
        )
        user_id = cursor.lastrowid
        
        # Create session token
        token = secrets.token_hex(32)
        cursor.execute("INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)", (token, user_id, now))
        conn.commit()
        
        return {
            "token": token,
            "user": {
                "id": user_id,
                "email": email,
                "name": name,
                "role": "researcher",
                "created_at": now
            }
        }


def authenticate_user(email: str, password: str) -> dict:
    """Validate credentials and return (user_dict, token) if valid."""
    email = email.strip().lower()
    if not email or not password:
        raise ValueError("Email and password are required.")
        
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
        row = cursor.fetchone()
        
        if not row:
            raise ValueError("Invalid email or password.")
            
        if not check_password_hash(row["password_hash"], password):
            raise ValueError("Invalid email or password.")
            
        user_id = row["id"]
        token = secrets.token_hex(32)
        now = datetime.utcnow().isoformat() + "Z"
        cursor.execute("INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)", (token, user_id, now))
        conn.commit()
        
        return {
            "token": token,
            "user": {
                "id": user_id,
                "email": row["email"],
                "name": row["name"],
                "role": row["role"],
                "created_at": row["created_at"]
            }
        }


def get_user_from_token(token: str) -> dict:
    """Retrieve user dictionary given a session token, or None if invalid."""
    if not token:
        return None
        
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT u.id, u.email, u.name, u.role, u.created_at
            FROM tokens t
            JOIN users u ON t.user_id = u.id
            WHERE t.token = ?
        """, (token,))
        row = cursor.fetchone()
        if not row:
            return None
            
        return {
            "id": row["id"],
            "email": row["email"],
            "name": row["name"],
            "role": row["role"],
            "created_at": row["created_at"]
        }


def revoke_token(token: str) -> None:
    """Remove session token upon logout."""
    if not token:
        return
    with get_db() as conn:
        conn.execute("DELETE FROM tokens WHERE token = ?", (token,))
        conn.commit()


# ── User Workspace Association Helpers ────────────────────────────────────────

def link_user_workspace(user_id: int, workspace_id: str) -> None:
    """Link a workspace to a user in SQLite database."""
    if not user_id or not workspace_id:
        return
    now = datetime.utcnow().isoformat() + "Z"
    with get_db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO user_workspaces (user_id, workspace_id, created_at) VALUES (?, ?, ?)",
            (user_id, workspace_id, now)
        )
        conn.commit()


def unlink_user_workspace(user_id: int, workspace_id: str) -> None:
    """Unlink a workspace from a user."""
    if not user_id or not workspace_id:
        return
    with get_db() as conn:
        conn.execute(
            "DELETE FROM user_workspaces WHERE user_id = ? AND workspace_id = ?",
            (user_id, workspace_id)
        )
        conn.commit()


def get_user_workspace_ids(user_id: int) -> set:
    """Get the set of workspace IDs linked to a specific user in SQLite."""
    if not user_id:
        return set()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT workspace_id FROM user_workspaces WHERE user_id = ?", (user_id,))
        rows = cursor.fetchall()
        return {r["workspace_id"] for r in rows}


def is_workspace_owned_by(workspace_id: str, user_id: int | None) -> bool:
    """Check if a workspace is owned by user_id (or unowned if user_id is None)."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM user_workspaces WHERE workspace_id = ?", (workspace_id,))
        row = cursor.fetchone()
        if not row:
            # Unlinked in DB table
            return True
        return row["user_id"] == user_id
