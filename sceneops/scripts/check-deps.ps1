# בדיקת תלויות: Python 3.12, Node.js, FFmpeg/FFprobe
. (Join-Path $PSScriptRoot "common.ps1")
$ok = $true
Write-Step "בדיקת תלויות מערכת"

$py = Find-Python312
if ($py) { Write-Ok ("Python 3.12 נמצא: " + ($py -join " ")) }
else { Write-Err2 "Python 3.12 לא נמצא. התקנה: winget install Python.Python.3.12"; $ok = $false }

$node = Test-Tool "node" @("--version")
if ($node) {
    $major = [int](($node -replace "^v", "").Split(".")[0])
    if ($major -ge 20) { Write-Ok "Node.js $node" } else { Write-Err2 "נדרש Node.js 20 ומעלה (נמצא $node). התקנה: winget install OpenJS.NodeJS.LTS"; $ok = $false }
} else { Write-Err2 "Node.js לא נמצא. התקנה: winget install OpenJS.NodeJS.LTS"; $ok = $false }

$ff = Test-Tool "ffmpeg" @("-version")
$fp = Test-Tool "ffprobe" @("-version")
if ($ff -and $fp) { Write-Ok "FFmpeg: $ff" }
else {
    Write-Warn2 "FFmpeg/FFprobe לא נמצאו ב-PATH. ללא FFmpeg לא תיווצר מדיית הדגמה, מטא-דאטה ותצוגה מקדימה."
    Write-Warn2 "התקנה: winget install Gyan.FFmpeg  (ואז לפתוח חלון PowerShell חדש), או להגדיר SCENEOPS_FFMPEG_PATH ב-.env"
}

if (-not $ok) { Write-Err2 "חסרות תלויות חובה."; exit 1 }
Write-Ok "כל תלויות החובה קיימות"
