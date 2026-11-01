# פונקציות משותפות לסקריפטים של SceneOps AI
$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$OnWindows = ($PSVersionTable.PSEdition -eq "Desktop") -or $IsWindows

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "  [V] $msg" -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }
function Write-Err2($msg) { Write-Host "  [X] $msg" -ForegroundColor Red }

function Get-VenvPython {
    if ($OnWindows) { return Join-Path $Backend ".venv\Scripts\python.exe" }
    return Join-Path $Backend ".venv/bin/python"
}

function Find-Python312 {
    # מחזיר פקודה להפעלת Python 3.12 (py launcher ב-Windows או python3.12)
    $candidates = @()
    if (Get-Command py -ErrorAction SilentlyContinue) { $candidates += ,@("py", "-3.12") }
    foreach ($n in @("python3.12", "python3", "python")) {
        if (Get-Command $n -ErrorAction SilentlyContinue) { $candidates += ,@($n) }
    }
    foreach ($c in $candidates) {
        try {
            $exe = $c[0]; $rest = @($c | Select-Object -Skip 1)
            $v = & $exe @rest -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
            if ($v -eq "3.12") { return ,$c }
        } catch { }
    }
    return $null
}

function Test-Tool($name, $versionArgs) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if (-not $cmd) { return $null }
    try { return (& $name @versionArgs 2>&1 | Select-Object -First 1) } catch { return "?" }
}

function Ensure-EnvFile {
    $envFile = Join-Path $Root ".env"
    if (-not (Test-Path $envFile)) {
        Copy-Item (Join-Path $Root ".env.example") $envFile
        Write-Ok "נוצר קובץ .env מתוך .env.example"
    }
}
