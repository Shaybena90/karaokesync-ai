@echo off
REM Starts the Python API at http://localhost:8000
cd /d "%~dp0\..\..\server"
call .venv\Scripts\python -m uvicorn karaokesync.api.main:app --reload --port 8000
pause
