@echo off
REM Starts the AI processing worker. The first run downloads the Whisper model.
cd /d "%~dp0\..\..\server"
call .venv\Scripts\python -m karaokesync.worker.runner
pause
