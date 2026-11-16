@echo off
cd /d "%~dp0"
python -m pip install -r requirements.txt
if not exist models\yolo11n.pt echo [!] Detector weights missing: put yolo11n.pt in video-search\models\ (the app will show the detector as unavailable)
start "" http://127.0.0.1:8765
python -m vsearch
