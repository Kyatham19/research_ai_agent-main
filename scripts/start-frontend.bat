@echo off
title Research AI — Frontend (Vite :3000)

cd /d "%~dp0..\frontend"

if not exist node_modules (
    echo [INFO] node_modules not found — running npm install...
    npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo.
echo  Starting Vite dev server on http://localhost:3000
echo  Proxies API calls to http://localhost:5000
echo  Press Ctrl+C to stop.
echo.
npm run dev
pause
