# בניית ממשק המשתמש להגשה מאוחדת דרך שרת ה-API (פורט אחד: http://127.0.0.1:8000)
. (Join-Path $PSScriptRoot "common.ps1")
Push-Location $Frontend
npm run build
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Write-Err2 "הבנייה נכשלה"; exit 1 }
Write-Ok "נבנה frontend\dist. כעת start-backend.ps1 + start-worker.ps1 מספיקים, והממשק זמין ב-http://127.0.0.1:8000"
