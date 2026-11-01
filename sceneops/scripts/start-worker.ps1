# הפעלת מנוע המשימות המקומי (תור עמיד מבוסס מסד נתונים)
. (Join-Path $PSScriptRoot "common.ps1")
$venvPy = Get-VenvPython
if (-not (Test-Path $venvPy)) { Write-Err2 "יש להריץ קודם scripts\setup.ps1"; exit 1 }
Set-Location $Backend
Write-Step "מנוע המשימות פועל. Ctrl+C לעצירה בגבול בטוח."
& $venvPy -m app.worker
