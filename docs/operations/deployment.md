# Deployment Guide — Research AI Agent

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Local Development Setup](#local-development-setup)
4. [Production Single-Server Deployment](#production-single-server-deployment)
5. [Environment Checklist](#environment-checklist)
6. [Port Configuration](#port-configuration)
7. [Reverse Proxy Setup (nginx)](#reverse-proxy-setup-nginx)
8. [HTTPS Configuration](#https-configuration)
9. [Process Management](#process-management)
10. [Health Check Endpoint](#health-check-endpoint)

---

## Architecture Overview

The application is a Flask + React SPA. In production, Flask serves both the API and the compiled React frontend as static files.

```
Browser
  └── HTTP :80 / :443
        └── nginx (reverse proxy, optional)
              └── Flask :5000
                    ├── /health          — health check
                    ├── /api/*           — REST API endpoints
                    ├── /analyze/*       — analysis endpoints
                    └── /*               — React SPA (frontend/dist/)
```

**Key files:**
- `backend/app.py` — Flask entry point; serves `../frontend/dist` as static root
- `backend/.env` — environment variables (never commit this file)
- `frontend/dist/` — compiled React build output (must exist before starting Flask)
- `backend/data/workspaces/` — persistent workspace data (JSON + uploaded PDFs)

---

## Prerequisites

### Python

- Python 3.10, 3.11, or 3.12 recommended
- Python 3.14 has a known pymupdf build failure (see [Troubleshooting](troubleshooting.md))
- Verify: `python --version`

### Node.js

- Node.js 18 or later (required for Vite 5)
- Verify: `node --version` and `npm --version`

### Gemini API Key

- Required to run any analysis feature
- Obtain from [aistudio.google.com](https://aistudio.google.com)
- Free tier available; rate limits apply

---

## Local Development Setup

Development mode runs two separate servers: Vite dev server (port 5173) for hot-reload React, and Flask (port 5000) for the API. CORS is enabled on Flask for cross-origin requests.

### Step 1 — Clone and enter the project

```bash
cd "d:/claude/Research AI Agent/research-analyzer"
```

### Step 2 — Set up the Python virtual environment

```bash
cd backend
python -m venv venv
```

Activate the venv:

- **Windows:** `venv\Scripts\activate`
- **macOS/Linux:** `source venv/bin/activate`

### Step 3 — Install Python dependencies

```bash
pip install -r requirements.txt
```

If you are on Python 3.14 and pymupdf fails to build, use the fallback command:

```bash
pip install flask==3.0.0 flask-cors==4.0.0 pdfminer.six==20221105 requests==2.31.0 google-generativeai==0.7.2 python-dotenv==1.0.0
```

The app will automatically fall back to `pdfminer.six` for PDF extraction when pymupdf is absent.

### Step 4 — Create the environment file

```bash
# backend/.env
echo GEMINI_API_KEY=your_key_here > .env
```

Do not add quotes around the key value. See [configuration.md](configuration.md) for the full `.env` reference.

### Step 5 — Start the Flask dev server

```bash
# from backend/
python app.py
```

Flask starts at `http://localhost:5000` with debug mode enabled.

### Step 6 — Start the React dev server (separate terminal)

```bash
cd frontend
npm install
npm run dev
```

Vite starts at `http://localhost:5173`. The React dev server proxies API calls to `http://localhost:5000` (configured in `vite.config.js` if present, otherwise requests go directly).

Open `http://localhost:5173` in your browser for the hot-reload experience during development.

---

## Production Single-Server Deployment

In production, Flask serves the compiled React build directly. There is no separate frontend server. This is the simplest deployment: one Python process handles everything.

### Step 1 — Set up the backend (same as development Steps 1-4)

```bash
cd "d:/claude/Research AI Agent/research-analyzer/backend"
python -m venv venv
# Activate venv (platform-specific, see above)
pip install -r requirements.txt
# Create backend/.env with GEMINI_API_KEY
```

### Step 2 — Build the React frontend

```bash
cd ../frontend
npm install
npm run build
```

This writes compiled assets to `frontend/dist/`. Flask's `static_folder='../frontend/dist'` setting points here. **This step must be repeated after any change to frontend source files.**

Verify the build output exists:

```bash
ls frontend/dist/
# Expected: index.html  assets/
```

### Step 3 — Start the Flask production server

```bash
cd ../backend
# Activate venv
python app.py
```

Flask starts at `http://localhost:5000`. The full app (API + UI) is accessible at this address.

For production, replace `python app.py` (which uses Flask's built-in dev server) with a WSGI server:

```bash
pip install gunicorn          # Linux/macOS
gunicorn -w 2 -b 0.0.0.0:5000 app:app
```

On Windows, use `waitress` instead of gunicorn:

```bash
pip install waitress
waitress-serve --host=0.0.0.0 --port=5000 app:app
```

> **Note:** Flask's built-in server (`python app.py`) is acceptable for single-user or low-traffic deployments. For multi-user production use, prefer gunicorn or waitress.

---

## Environment Checklist

Run through this checklist before starting the server in any environment:

| Item | How to verify | Expected result |
|------|--------------|-----------------|
| Python venv active | `which python` (Linux/macOS) or `where python` (Windows) | Path inside `backend/venv/` |
| Dependencies installed | `python -c "import flask, google.generativeai"` | No error |
| `backend/.env` exists | `ls backend/.env` | File present |
| `GEMINI_API_KEY` set | `python -c "from dotenv import load_dotenv; load_dotenv(); import os; print(bool(os.environ.get('GEMINI_API_KEY')))"` | `True` |
| `frontend/dist/` exists | `ls frontend/dist/index.html` | File present |
| Port 5000 free | `netstat -ano \| findstr :5000` (Windows) or `lsof -i :5000` (Linux/macOS) | No output (port free) |
| Network access to external APIs | `curl https://api.semanticscholar.org/graph/v1/paper/search?query=test&limit=1` | HTTP 200 |
| Health endpoint responds | `curl http://localhost:5000/health` (after server start) | `{"status": "ok", ...}` |

---

## Port Configuration

The default port is `5000`, set in the last line of `backend/app.py`:

```python
if __name__ == '__main__':
    app.run(debug=True, port=5000)
```

### Changing the port

Edit `backend/app.py`:

```python
# Change port=5000 to your desired port
app.run(debug=True, port=5001)
```

For production with gunicorn:

```bash
gunicorn -w 2 -b 0.0.0.0:5001 app:app
```

For production with waitress:

```bash
waitress-serve --host=0.0.0.0 --port=5001 app:app
```

> **Windows note:** Port 5000 may be occupied by AirPlay Receiver (macOS) or other system services. If you see "Address already in use", see [Troubleshooting](troubleshooting.md#port-5000-already-in-use).

---

## Reverse Proxy Setup (nginx)

Use nginx to expose the app on port 80/443 and add TLS termination. Flask continues running on port 5000; nginx proxies requests to it.

### Install nginx

```bash
# Ubuntu/Debian
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx

# macOS (Homebrew)
brew install nginx
```

### nginx site configuration

Create `/etc/nginx/sites-available/research-ai`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS (remove this block if not using TLS)
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    # TLS certificates (see HTTPS section below)
    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Increase body size limit for PDF uploads (default 1MB is too small)
    client_max_body_size 50M;

    # Proxy all requests to Flask
    location / {
        proxy_pass         http://127.0.0.1:5000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # Increase timeouts for long-running analysis requests
        proxy_read_timeout    120s;
        proxy_connect_timeout  10s;
        proxy_send_timeout     60s;
    }
}
```

Enable the site and reload nginx:

```bash
sudo ln -s /etc/nginx/sites-available/research-ai /etc/nginx/sites-enabled/
sudo nginx -t          # test configuration syntax
sudo systemctl reload nginx
```

### Local-only nginx (no TLS, port 80)

For a local network deployment without HTTPS:

```nginx
server {
    listen 80;
    server_name localhost;

    client_max_body_size 50M;

    location / {
        proxy_pass        http://127.0.0.1:5000;
        proxy_set_header  Host $host;
        proxy_set_header  X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }
}
```

---

## HTTPS Configuration

### Self-signed certificate (local development / internal use)

Generate a self-signed certificate valid for 365 days:

```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem \
  -days 365 -nodes -subj "/CN=localhost"
```

Run Flask directly with TLS (development only, not for nginx setups):

```python
# In app.py, replace the last block temporarily:
if __name__ == '__main__':
    app.run(debug=True, port=5000, ssl_context=('cert.pem', 'key.pem'))
```

Browsers will show a security warning for self-signed certificates. Proceed by adding an exception.

### Let's Encrypt (production, requires a public domain)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Obtain and install certificate (nginx plugin auto-configures nginx)
sudo certbot --nginx -d your-domain.com

# Certificates auto-renew via a systemd timer installed by certbot
# Verify auto-renewal works:
sudo certbot renew --dry-run
```

Certificates are stored at `/etc/letsencrypt/live/your-domain.com/` and renew automatically every 60 days.

---

## Process Management

### Linux/macOS — nohup (simple, persistent terminal session)

Start the server in the background and keep it running after terminal close:

```bash
cd "path/to/research-analyzer/backend"
source venv/bin/activate
nohup python app.py > ../logs/flask.log 2>&1 &
echo $! > ../flask.pid     # save PID for later
```

Stop the server:

```bash
kill $(cat ../flask.pid)
```

### Linux — systemd service (recommended for production)

Create `/etc/systemd/system/research-ai.service`:

```ini
[Unit]
Description=Research AI Agent (Flask)
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/research-analyzer/backend
Environment="PATH=/path/to/research-analyzer/backend/venv/bin"
EnvironmentFile=/path/to/research-analyzer/backend/.env
ExecStart=/path/to/research-analyzer/backend/venv/bin/gunicorn \
          -w 2 -b 127.0.0.1:5000 --timeout 120 app:app
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable research-ai
sudo systemctl start research-ai
sudo systemctl status research-ai
```

View logs:

```bash
sudo journalctl -u research-ai -f
```

### Windows — run as a background process

Using `nohup` equivalent in Git Bash or WSL:

```bash
nohup python app.py > flask.log 2>&1 &
```

Using the Windows Task Scheduler (GUI-based, for auto-start on boot):

1. Open Task Scheduler
2. Create Task → General: name it "Research AI Agent", run whether user is logged on or not
3. Triggers: At startup
4. Actions: Start a program
   - Program: `D:\claude\Research AI Agent\research-analyzer\backend\venv\Scripts\python.exe`
   - Arguments: `app.py`
   - Start in: `D:\claude\Research AI Agent\research-analyzer\backend`
5. Conditions: uncheck "Start only if computer is on AC power"

### Windows — NSSM (Non-Sucking Service Manager)

NSSM wraps any executable as a proper Windows service with auto-restart:

```bash
# Download nssm from https://nssm.cc
nssm install ResearchAI "D:\claude\Research AI Agent\research-analyzer\backend\venv\Scripts\python.exe"
nssm set ResearchAI AppParameters "app.py"
nssm set ResearchAI AppDirectory "D:\claude\Research AI Agent\research-analyzer\backend"
nssm set ResearchAI AppStdout "D:\claude\Research AI Agent\research-analyzer\logs\flask.log"
nssm set ResearchAI AppStderr "D:\claude\Research AI Agent\research-analyzer\logs\flask_err.log"
nssm start ResearchAI
```

Manage the service:

```bash
nssm status ResearchAI
nssm stop ResearchAI
nssm restart ResearchAI
```

---

## Health Check Endpoint

The app exposes a health check at `GET /health` that returns JSON:

```json
{
  "status": "ok",
  "llm": "gemini-2.5-flash",
  "api_key_configured": true
}
```

`api_key_configured` is `false` if `GEMINI_API_KEY` is missing from the environment. The server starts regardless, but all LLM-dependent routes will fail until the key is set.

### Usage examples

```bash
# Basic liveness check
curl http://localhost:5000/health

# Check API key is configured
curl -s http://localhost:5000/health | python -m json.tool

# Use in a shell script (exit 1 if unhealthy)
curl -sf http://localhost:5000/health | grep -q '"status": "ok"' || exit 1
```

### nginx upstream health check

Add to the nginx server block to have nginx verify Flask is running before forwarding requests:

```nginx
location /health {
    proxy_pass http://127.0.0.1:5000/health;
    access_log off;
}
```

External monitoring tools (UptimeRobot, Pingdom, etc.) can poll `https://your-domain.com/health` and alert when the response deviates from the expected JSON.
