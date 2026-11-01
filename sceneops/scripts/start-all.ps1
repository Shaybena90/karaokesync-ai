# הפעלת שרת API, מנוע משימות וממשק משתמש – כל אחד בחלון נפרד
. (Join-Path $PSScriptRoot "common.ps1")
$shell = if (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell" }
foreach ($s in @("start-backend.ps1", "start-worker.ps1", "start-frontend.ps1")) {
    $path = Join-Path $PSScriptRoot $s
    Start-Process $shell -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$path`"")
    Start-Sleep -Seconds 2
}
Write-Ok "שלושת הרכיבים הופעלו בחלונות נפרדים."
Write-Host "  פתחו בדפדפן: http://127.0.0.1:5173" -ForegroundColor Gray
Start-Sleep -Seconds 4
try { Start-Process "http://127.0.0.1:5173" } catch { }
