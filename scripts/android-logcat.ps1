param([Parameter(Mandatory=$true)][string]$Serial)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$adb = Join-Path $root '.android-tools/sdk/platform-tools/adb.exe'
$package = 'com.shiguang.mealplanner'
$packages = & $adb -s $Serial shell cmd package list packages -U $package
$identity = $packages | Where-Object { $_ -match ('^package:' + [regex]::Escape($package) + ' uid:\d+\s*$') }
if ($LASTEXITCODE -ne 0 -or "$identity" -notmatch 'uid:(\d+)') { throw 'Cannot resolve installed app UID' }
$appUid = $Matches[1]
$directory = Join-Path $root ('.android-tools/device-logs/' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $directory -Force | Out-Null
# Only diagnostic tags, never Capacitor bridge payloads or request bodies.
$arguments = @('-s', $Serial, 'logcat', "--uid=$appUid", '-v', 'threadtime', '-T', '1', 'ShiguangNetwork:I', 'AndroidRuntime:E', 'chromium:E', 'Capacitor/Console:E', '*:S')
$process = Start-Process -FilePath $adb -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $directory 'device.log') -RedirectStandardError (Join-Path $directory 'collector-error.log')
Start-Sleep -Milliseconds 500
if ($process.HasExited) { throw "Log collector stopped: $directory" }
$session = @{ serial=$Serial; appUid=$appUid; processId=$process.Id; startedAt=(Get-Date).ToString('o'); directory=$directory; package=$package }
$session | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $directory 'session.json')
$session | ConvertTo-Json
