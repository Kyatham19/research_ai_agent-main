@echo off
title Research AI — Integration Tests

cd /d "%~dp0..\tests"

REM Check backend is reachable
echo  Checking backend at http://localhost:5000/health...
curl -s http://localhost:5000/health | findstr "ok" >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [ERROR] Backend is not running or /health did not return ok.
    echo  Start it first with:  scripts\start-backend.bat
    echo.
    pause
    exit /b 1
)

REM Check GEMINI_API_KEY is set
if "%GEMINI_API_KEY%"=="" (
    REM Try reading from backend\.env
    for /f "tokens=2 delims==" %%v in ('findstr /i "GEMINI_API_KEY" "%~dp0..\backend\.env" 2^>nul') do set GEMINI_API_KEY=%%v
)

if "%GEMINI_API_KEY%"=="" (
    echo.
    echo  [ERROR] GEMINI_API_KEY is not set and was not found in backend\.env.
    echo  Add it to backend\.env:  GEMINI_API_KEY=^<your key^>
    echo.
    pause
    exit /b 1
)

echo  [OK] Backend healthy. GEMINI_API_KEY found.
echo.
echo  ============================================================
echo   Running integration tests (13-integration.spec.js)
echo   These make real LLM calls — expect 2-5 minutes.
echo  ============================================================
echo.

npx playwright test e2e/13-integration.spec.js --reporter=list

set EXIT_CODE=%ERRORLEVEL%

echo.
if %EXIT_CODE%==0 (
    echo  [PASS] Integration tests passed.
) else (
    echo  [FAIL] Some integration tests failed.
    echo         cd tests ^&^& npx playwright show-report
)
echo.
pause
exit /b %EXIT_CODE%
