@echo off
REM Updates this copy of KaraokeSync AI to the newest version from GitHub.
REM Your .env file, the installed Python packages and the AI models are kept.
REM Close the worker window first, then run this, then start the worker again.
REM "9-update-worker.bat auto" is used by worker-forever.bat: no questions, and it
REM does not replace worker-forever.bat while that window is running it.
setlocal
set MODE=%~1
REM The project folder: given by worker-forever.bat (it runs a copy of this file), else this file's own.
if "%~2"=="" (cd /d "%~dp0\..\..") else (cd /d "%~2")
echo Downloading the newest version...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; $ErrorActionPreference='Stop'; $z=Join-Path $env:TEMP 'ks-update.zip'; $d=Join-Path $env:TEMP 'ks-update'; if (Test-Path $d) { Remove-Item $d -Recurse -Force }; Invoke-WebRequest 'https://github.com/Shaybena90/karaokesync-ai/archive/refs/heads/main.zip' -OutFile $z; Expand-Archive $z $d -Force; Remove-Item $z"
if errorlevel 1 goto failed
echo Copying the new files over this folder (your .env stays)...
if /i "%MODE%"=="auto" (
  robocopy "%TEMP%\ks-update\karaokesync-ai-main" "%CD%" /E /XF .env worker-forever.bat /NFL /NDL /NJH /NJS /NP
) else (
  robocopy "%TEMP%\ks-update\karaokesync-ai-main" "%CD%" /E /XF .env /NFL /NDL /NJH /NJS /NP
)
if errorlevel 8 goto failed
rmdir /s /q "%TEMP%\ks-update"
echo Checking the Python packages (new ones are installed, the rest is kept)...
if exist server\.venv\Scripts\python.exe (
  if exist server\requirements-ai.txt (
    call server\.venv\Scripts\python -m pip install -q -r server\requirements-ai.txt
  )
)
echo.
echo Done.
if /i "%MODE%"=="auto" exit /b 0
echo Start the worker again (5-start-worker.bat). Its first line should show the new version.
pause
exit /b 0
:failed
echo.
echo The update did not finish. Check the internet connection and try again.
if /i "%MODE%"=="auto" exit /b 1
pause
exit /b 1
