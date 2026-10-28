@echo off
REM KaraokeSync AI - one-time installation (website + API)
cd /d "%~dp0\..\.."

where node >nul 2>nul || (echo [X] Node.js is not installed. See README. & pause & exit /b 1)
where py >nul 2>nul || (echo [X] Python is not installed. See README. & pause & exit /b 1)
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
if not exist ".venv" py -3 -m venv .venv
call .venv\Scripts\python -m pip install --upgrade pip
call .venv\Scripts\python -m pip install -r requirements-dev.txt || (pause & exit /b 1)
cd ..

echo.
echo Done! Next: run 2-start-website.bat and 3-start-api.bat
pause
