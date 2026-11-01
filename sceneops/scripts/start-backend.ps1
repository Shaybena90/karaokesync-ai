# הפעלת שרת ה-API (127.0.0.1:8000 בלבד)
param([int]$Port = 8000)
. (Join-Path $PSScriptRoot "common.ps1")
$venvPy = Get-VenvPython
if (-not (Test-Path $venvPy)) { Write-Err2 "יש להריץ קודם scripts\setup.ps1"; exit 1 }
Set-Location $Backend
& $venvPy -m alembic upgrade head
Write-Step "שרת API פועל בכתובת http://127.0.0.1:$Port  (תיעוד: /api/docs)"
& $venvPy -m uvicorn app.main:app --host 127.0.0.1 --port $Port
