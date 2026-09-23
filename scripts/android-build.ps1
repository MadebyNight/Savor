param([switch]$ConnectedTests)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
Set-Location $workspace
$jdk = Get-ChildItem "$workspace/.android-tools/jdk21" -Directory | Select-Object -First 1
if (!$jdk -or !(Test-Path "$($jdk.FullName)/bin/java.exe")) { throw 'JDK 21 is missing.' }
$env:JAVA_HOME = $jdk.FullName
$env:GRADLE_USER_HOME = "$workspace/.android-tools/gradle-home-ascii"
$env:ANDROID_HOME = "$workspace/.android-tools/sdk"
$env:ANDROID_USER_HOME = "$workspace/.android-tools/android-home"
$env:ANDROID_AVD_HOME = "$workspace/.android-tools/avd"
$env:Path = "$env:JAVA_HOME/bin;$env:ANDROID_HOME/platform-tools;$env:Path"
$gradle = "$workspace/.android-tools/gradle-dist/gradle-8.13/bin/gradle.bat"
$signer = "$env:ANDROID_HOME/build-tools/36.0.0/apksigner.bat"
foreach ($required in @($gradle, $signer, "$workspace/.android-tools/signing.properties", "$env:ANDROID_USER_HOME/legacy-debug.keystore")) {
    if (!(Test-Path -LiteralPath $required)) { throw "Required build input missing: $required" }
}
$sdk = $env:ANDROID_HOME.Replace('\', '/')
$escaped = -join ($sdk.ToCharArray() | ForEach-Object { if ([int]$_ -gt 127) { '\u{0:x4}' -f [int]$_ } else { [string]$_ } })
"sdk.dir=$escaped" | Set-Content -Encoding ASCII android/local.properties
$ErrorActionPreference = 'Continue'
& $gradle -p android verifyLegacyDebugCertificate --offline --no-daemon
if ($LASTEXITCODE -ne 0) { throw 'Original signing certificate verification failed.' }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
& npx.cmd --no-install cap sync android
if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed.' }
$tasks = @('assembleDebug', 'testDebugUnitTest')
if ($ConnectedTests) { $tasks += 'connectedDebugAndroidTest' }
& $gradle -p android @tasks --offline --no-daemon
if ($LASTEXITCODE -ne 0) { throw 'Android build or tests failed.' }
$apk = "$workspace/android/app/build/outputs/apk/debug/app-debug.apk"
$verification = & $signer verify --verbose --print-certs $apk 2>&1
if ($LASTEXITCODE -ne 0) { throw 'Final APK signature is invalid.' }
$expected = '82822576f8ce89e9029d3246e5dee0f988af129389333426ebeae9253a0eae9e'
if (!(($verification -join "`n") -match "Signer #1 certificate SHA-256 digest: $expected")) { throw 'Final APK certificate does not match the original installation.' }
Write-Output 'PASS: final APK signed with the original certificate.'
Write-Output $apk
