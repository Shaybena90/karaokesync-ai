# הפעלת סוכן ההדגמה המקומי (דורש מצב "סימולציה מקומית" במסך שליטה מרחוק)
param([string]$Url = "http://127.0.0.1:8000", [string]$Key = "agt_demo_local", [string]$SecretFile = "", [switch]$Once)
. (Join-Path $PSScriptRoot "common.ps1")
$venvPy = Get-VenvPython
if (-not $SecretFile) { $SecretFile = Join-Path $Root "data\demo_agent.secret" }
if (-not (Test-Path $SecretFile)) { Write-Err2 "קובץ הסוד לא נמצא: $SecretFile"; exit 1 }
Set-Location $Backend
$agentArgs = @("-m", "app.agent", "--url", $Url, "--key", $Key, "--secret-file", $SecretFile)
if ($Once) { $agentArgs += "--once" }
Write-Step "סוכן $Key מתחבר אל $Url (משימות מרשימה מותרת בלבד)"
& $venvPy @agentArgs
