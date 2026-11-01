# התקנה מלאה: סביבת Python, חבילות Node, מסד נתונים ונתוני הדגמה בדויים
param([switch]$SkipFrontend, [switch]$NoDemoJobs)
. (Join-Path $PSScriptRoot "common.ps1")

& (Join-Path $PSScriptRoot "check-deps.ps1")
if ($LASTEXITCODE -ne 0) { exit 1 }
Ensure-EnvFile

Write-Step "יצירת סביבת Python (backend\.venv)"
$venvPy = Get-VenvPython
if (-not (Test-Path $venvPy)) {
    $py = Find-Python312
    $exe = $py[0]; $rest = @($py | Select-Object -Skip 1)
    & $exe @rest -m venv (Join-Path $Backend ".venv")
    if ($LASTEXITCODE -ne 0) { Write-Err2 "יצירת venv נכשלה"; exit 1 }
}
& $venvPy -m pip install --upgrade pip --quiet
& $venvPy -m pip install -r (Join-Path $Backend "requirements-dev.txt") --quiet
if ($LASTEXITCODE -ne 0) { Write-Err2 "התקנת חבילות Python נכשלה"; exit 1 }
Write-Ok "חבילות Python הותקנו"

Write-Step "יצירת/עדכון מסד הנתונים (Alembic)"
Push-Location $Backend
try {
    & $venvPy -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw "alembic" }
    Write-Ok "המסד מעודכן"
    Write-Step "יצירת נתוני הדגמה בדויים ומדיה סינתטית"
    $seedArgs = @("-m", "app.seed")
    if ($NoDemoJobs) { $seedArgs += "--no-jobs" }
    & $venvPy @seedArgs
    if ($LASTEXITCODE -ne 0) { throw "seed" }
} catch { Write-Err2 "שלב המסד נכשל: $_"; Pop-Location; exit 1 }
Pop-Location

if (-not $SkipFrontend) {
    Write-Step "התקנת חבילות ממשק המשתמש (npm ci)"
    Push-Location $Frontend
    npm ci --no-audit --no-fund
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { Write-Err2 "npm ci נכשל"; exit 1 }
    Write-Ok "חבילות Node הותקנו"
}

Write-Host ""
Write-Ok "ההתקנה הושלמה. להפעלה: scripts\start-all.ps1  ואז לפתוח http://127.0.0.1:5173"
Write-Host "  משתמשי הדגמה: admin / Admin!2025 · noa / Invest!2025 · viewer / Viewer!2025" -ForegroundColor Gray
