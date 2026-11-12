@echo off
REM Start the worker automatically when you sign in to Windows, and keep it running.
REM Pause and resume it from the website (phone) - see the "Processing server" page.
REM To turn the automatic start off:  schtasks /Delete /TN "KaraokeSync Worker" /F
schtasks /Create /TN "KaraokeSync Worker" /TR "\"%~dp0worker-forever.bat\"" /SC ONLOGON /RL LIMITED /F || (pause & exit /b 1)
echo.
echo Done: the worker starts by itself every time you sign in to Windows.
echo Starting it now...
schtasks /Run /TN "KaraokeSync Worker"
echo.
echo Tip: so it keeps working when you are away, set Windows sleep to "Never"
echo (Settings - System - Power) and keep the computer on.
pause
