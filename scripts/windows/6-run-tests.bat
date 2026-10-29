@echo off
cd /d "%~dp0\..\..\server"
call .venv\Scripts\python -m pytest -q
cd ..\web
call npm test
REM Browser tests on 7 device profiles (downloads Chromium the first time)
call npx playwright install chromium
call npm run e2e
pause
