@echo off
REM Keeps the processing server (worker) running: if it stops for any reason it
REM starts again after 10 seconds. Close this window to stop it for good.
REM When a new version is published, the worker stops between jobs (exit code 3):
REM this window then updates it (9-update-worker.bat auto) and starts it again.
title KaraokeSync Worker
set KARAOKESYNC_SUPERVISED=1
set KARAOKESYNC_JUST_UPDATED=
:loop
cd /d "%~dp0\..\..\server"
call .venv\Scripts\python -m karaokesync.worker.runner
if errorlevel 4 goto restart
if errorlevel 3 goto update
:restart
set KARAOKESYNC_JUST_UPDATED=
echo.
echo The worker stopped. Starting it again in 10 seconds (close this window to stop it).
timeout /t 10 /nobreak >nul
goto loop
:update
echo.
echo A new version of the worker is published: updating it now...
REM A copy runs, so the update can safely replace 9-update-worker.bat itself.
copy /y "%~dp09-update-worker.bat" "%TEMP%\ks-update-worker.bat" >nul
call "%TEMP%\ks-update-worker.bat" auto "%~dp0..\.."
set KARAOKESYNC_JUST_UPDATED=1
goto loop
