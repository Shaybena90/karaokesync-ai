# איפוס נתוני ההדגמה: מחיקת המסד, האחסון והמדיה הסינתטית ויצירתם מחדש
param([switch]$Force)
. (Join-Path $PSScriptRoot "common.ps1")
if (-not $Force) {
    $a = Read-Host "פעולה זו תמחק את כל נתוני המערכת המקומיים (data\) ואת מדיית ההדגמה. להמשיך? (כן/לא)"
    if ($a -ne "כן" -and $a -ne "y") { Write-Warn2 "בוטל"; exit 0 }
}
Remove-Item -Recurse -Force (Join-Path $Root "data") -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $Root "sample_data\evidence") -ErrorAction SilentlyContinue
$venvPy = Get-VenvPython
Push-Location $Backend
& $venvPy -m alembic upgrade head
& $venvPy -m app.seed
Pop-Location
Write-Ok "נתוני ההדגמה אותחלו מחדש. יש להפעיל מחדש את השרת ואת מנוע המשימות."
