@echo off
REM Installs the heavy AI packages (faster-whisper, Demucs/PyTorch). Large download (several GB).
cd /d "%~dp0\..\..\server"
call .venv\Scripts\python -m pip install -r requirements-ai.txt
pause
