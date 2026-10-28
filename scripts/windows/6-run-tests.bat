@echo off
cd /d "%~dp0\..\..\server"
call .venv\Scripts\python -m pytest -q
cd ..\web
call npm test
pause
