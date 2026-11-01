# הפעלת ממשק המשתמש (Vite) בכתובת http://127.0.0.1:5173
. (Join-Path $PSScriptRoot "common.ps1")
Set-Location $Frontend
if (-not (Test-Path (Join-Path $Frontend "node_modules"))) { Write-Err2 "יש להריץ קודם scripts\setup.ps1"; exit 1 }
Write-Step "ממשק המשתמש: http://127.0.0.1:5173"
npm run dev
