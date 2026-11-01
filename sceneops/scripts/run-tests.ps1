# הרצת בדיקות: pytest (שרת), Vitest (ממשק) ו-Playwright (קצה לקצה, אופציונלי)
param([switch]$E2E)
. (Join-Path $PSScriptRoot "common.ps1")
$venvPy = Get-VenvPython
$failed = $false

Write-Step "pytest"
Push-Location $Backend
& $venvPy -m pytest -q
if ($LASTEXITCODE -ne 0) { $failed = $true }
Pop-Location

Write-Step "Vitest + בדיקת טיפוסים"
Push-Location $Frontend
npx tsc -b
if ($LASTEXITCODE -ne 0) { $failed = $true }
npx vitest run
if ($LASTEXITCODE -ne 0) { $failed = $true }
if ($E2E) {
    Write-Step "Playwright (נדרשים שרת, עובד וממשק פעילים – start-all.ps1)"
    npx playwright install chromium
    npx playwright test
    if ($LASTEXITCODE -ne 0) { $failed = $true }
}
Pop-Location

if ($failed) { Write-Err2 "חלק מהבדיקות נכשלו"; exit 1 }
Write-Ok "כל הבדיקות עברו"
