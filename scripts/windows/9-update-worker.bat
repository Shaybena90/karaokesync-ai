@echo off
REM Updates this copy of KaraokeSync AI to the newest version from GitHub.
REM Your .env file, the installed Python packages and the AI models are kept.
REM Close the worker window first, then run this, then start the worker again.
cd /d "%~dp0\..\.."
echo Downloading the newest version...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; $ErrorActionPreference='Stop'; $z=Join-Path $env:TEMP 'ks-update.zip'; $d=Join-Path $env:TEMP 'ks-update'; if (Test-Path $d) { Remove-Item $d -Recurse -Force }; Invoke-WebRequest 'https://github.com/Shaybena90/karaokesync-ai/archive/refs/heads/main.zip' -OutFile $z; Expand-Archive $z $d -Force; Remove-Item $z"
if errorlevel 1 goto failed
echo Copying the new files over this folder (your .env stays)...
robocopy "%TEMP%\ks-update\karaokesync-ai-main" "%CD%" /E /XF .env /NFL /NDL /NJH /NJS /NP
if errorlevel 8 goto failed
rmdir /s /q "%TEMP%\ks-update"
echo.
echo Done. Start the worker again (5-start-worker.bat). Its first line should show the new version.
pause
exit /b 0
:failed
echo.
echo The update did not finish. Check the internet connection and try again.
pause
exit /b 1
