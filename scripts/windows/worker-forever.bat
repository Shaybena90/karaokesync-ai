@echo off
REM Keeps the processing server (worker) running: if it stops for any reason it
REM starts again after 10 seconds. Close this window to stop it for good.
title KaraokeSync Worker
cd /d "%~dp0\..\..\server"
:loop
call .venv\Scripts\python -m karaokesync.worker.runner
echo.
echo The worker stopped. Starting it again in 10 seconds (close this window to stop it).
timeout /t 10 /nobreak >nul
goto loop
