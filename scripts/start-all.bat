@echo off
title Research AI — Launcher

echo.
echo  Research AI Agent — Full Stack Launcher
echo  =========================================
echo  Backend  ^>  http://localhost:5000
echo  Frontend ^>  http://localhost:3000
echo.

REM Start backend in a separate window
start "Research AI — Backend (Flask :5000)" cmd /k "cd /d "%~dp0..\backend" && call venv\Scripts\activate.bat && python app.py"

REM Give Flask a moment to bind before the browser might open
timeout /t 4 /nobreak >nul

REM Start frontend in a separate window
start "Research AI — Frontend (Vite :3000)" cmd /k "cd /d "%~dp0..\frontend" && npm run dev"

echo  Both servers are starting in separate windows.
echo  Close those windows (or press Ctrl+C in each) to stop.
echo.
pause
