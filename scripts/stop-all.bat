@echo off
title Research AI — Stop All Servers

echo.
echo  Research AI Agent — Stopping Servers
echo  ======================================

REM Kill Flask (python app.py on port 5000)
echo  Stopping backend (port 5000)...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5000 " ^| findstr "LISTENING"') do (
    taskkill /PID %%p /F >nul 2>&1
    echo  [OK] Killed PID %%p ^(port 5000^)
)

REM Kill Vite dev server (node on port 3000)
echo  Stopping frontend (port 3000)...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /PID %%p /F >nul 2>&1
    echo  [OK] Killed PID %%p ^(port 3000^)
)

REM Close the launcher windows opened by start-all.bat
echo  Closing launcher windows...
taskkill /FI "WINDOWTITLE eq Research AI — Backend (Flask :5000)" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Research AI — Frontend (Vite :3000)" /F >nul 2>&1

echo.
echo  Done. All Research AI servers stopped.
echo.
pause
