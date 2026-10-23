@echo off
title Research AI — Playwright Test Suite

cd /d "%~dp0..\tests"

if not exist node_modules (
    echo [INFO] node_modules not found — running npm install...
    npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

REM Check Vite dev server is reachable (tests run against localhost:3000)
echo  Checking frontend at http://localhost:3000...
curl -s -o nul -w "%%{http_code}" http://localhost:3000 | findstr "200 301 302" >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [WARN] Frontend does not appear to be running on port 3000.
    echo  Start it first with:  scripts\start-frontend.bat
    echo.
    set /p CONTINUE="Continue anyway? [y/N]: "
    if /i not "%CONTINUE%"=="y" exit /b 1
    echo.
)

echo.
echo  ============================================================
echo   Running mocked E2E suite (specs 01-12, 14-16)
echo   Integration tests (13) excluded — require GEMINI_API_KEY
echo  ============================================================
echo.

npx playwright test --ignore-glob "**/13-integration*" --reporter=list

set EXIT_CODE=%ERRORLEVEL%

echo.
if %EXIT_CODE%==0 (
    echo  [PASS] All tests passed.
) else (
    echo  [FAIL] Some tests failed. Run the HTML report for details:
    echo         npx playwright show-report
)

echo.
echo  Options:
echo    View HTML report  :  cd tests ^&^& npx playwright show-report
echo    Integration tests :  scripts\run-tests-integration.bat
echo.
pause
exit /b %EXIT_CODE%
