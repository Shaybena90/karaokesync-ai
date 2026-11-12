@echo off
REM Use the NVIDIA graphics card for the AI (Whisper + Demucs) and the video.
REM Large download (about 3 GB). Run once, after 1-install.bat and 4-install-ai.bat.
cd /d "%~dp0\..\..\server"

echo === CUDA libraries for Whisper (cuBLAS 12, cuDNN 9) ===
call .venv\Scripts\python -m pip install nvidia-cublas-cu12 nvidia-cudnn-cu12 || (pause & exit /b 1)

echo === PyTorch with CUDA for Demucs ===
REM The newest CUDA build that installs is used; the check below says if it works.
call .venv\Scripts\python -m pip install --force-reinstall --no-deps torch --index-url https://download.pytorch.org/whl/cu128 && goto check
call .venv\Scripts\python -m pip install --force-reinstall --no-deps torch --index-url https://download.pytorch.org/whl/cu130 && goto check
call .venv\Scripts\python -m pip install --force-reinstall --no-deps torch --index-url https://download.pytorch.org/whl/cu126

:check
echo.
echo === What runs on the graphics card ===
call .venv\Scripts\python -m karaokesync.worker.gpu
echo.
echo Lines that start with OK use the graphics card. Then start 5-start-worker.bat.
pause
