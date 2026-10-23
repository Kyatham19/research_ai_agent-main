@echo off
title Research AI — Backend (Flask :5000)

cd /d "%~dp0..\backend"

if not exist venv\Scripts\activate.bat (
    echo [ERROR] Virtual environment not found at backend\venv\
    echo Run:  cd backend ^&^& python -m venv venv ^&^& venv\Scripts\pip install -r requirements.txt
    pause
    exit /b 1
)

if not exist .env (
    echo [WARN] backend\.env not found — GEMINI_API_KEY will not be loaded.
    echo Create backend\.env with:  GEMINI_API_KEY=^<your key^>
    echo.
)

call venv\Scripts\activate.bat
echo.
echo  Starting Flask backend on http://localhost:5000
echo  Press Ctrl+C to stop.
echo.
python app.py
pause
