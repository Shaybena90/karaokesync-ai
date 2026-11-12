@echo off
REM KaraokeSync AI - one-time installation (website + API)
cd /d "%~dp0\..\.."

where node >nul 2>nul || (echo [X] Node.js is not installed. See README. & pause & exit /b 1)
REM Python: the "py" launcher, or "python" when the launcher was not installed.
REM (Running it, not just finding it: Windows has a "python" shortcut that only opens the Store.)
set "PY="
py -3 --version >nul 2>nul && set "PY=py -3"
if not defined PY (python --version >nul 2>nul && set "PY=python")
if not defined PY (
  echo [X] Python is not installed, or this window was opened before it was installed.
  echo     Close this window, open a new one and try again. If it still fails: restart the computer.
  pause & exit /b 1
)
where ffmpeg >nul 2>nul || (echo [!] FFmpeg was not found on PATH. The API needs it to verify uploads. See README.)

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo [i] Created .env from .env.example - open it and fill in your Supabase keys.
)

echo === Installing website packages ===
cd web
call npm install || (pause & exit /b 1)
cd ..

echo === Creating Python environment ===
cd server
if not exist ".venv" %PY% -m venv .venv
call .venv\Scripts\python -m pip install --upgrade pip
call .venv\Scripts\python -m pip install -r requirements-dev.txt || (pause & exit /b 1)
cd ..

echo.
echo Done! Next: run 2-start-website.bat and 3-start-api.bat
pause
