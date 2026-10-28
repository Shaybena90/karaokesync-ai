@echo off
REM Starts the website at http://localhost:5173
cd /d "%~dp0\..\..\web"
call npm run dev
pause
