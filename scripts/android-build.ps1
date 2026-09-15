param([switch]$ConnectedTests)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
Set-Location $workspace
$jdk = Get-ChildItem "$workspace/.android-tools/jdk21" -Directory | Select-Object -First 1
if (!$jdk -or !(Test-Path "$jdk/bin/java.exe")) { throw '请先将 JDK 21 解压到 .android-tools/jdk21/ 下。' }
$env:JAVA_HOME = $jdk.FullName
$env:GRADLE_USER_HOME = "$workspace/.android-tools/gradle-home"
$env:ANDROID_HOME = "$workspace/.android-tools/sdk"
$env:ANDROID_USER_HOME = "$workspace/.android-tools/android-home"
$env:ANDROID_AVD_HOME = "$workspace/.android-tools/avd"
$env:Path = "$env:JAVA_HOME/bin;$env:ANDROID_HOME/platform-tools;$env:Path"
if (!(Test-Path "$env:ANDROID_HOME/platform-tools/adb.exe")) { throw '缺少 .android-tools/sdk 中的 Android SDK。' }
# Java properties require ASCII Unicode escapes for Chinese Windows paths.
$sdk = $env:ANDROID_HOME.Replace('\', '/')
$escaped = -join ($sdk.ToCharArray() | ForEach-Object { if ([int]$_ -gt 127) { '\u{0:x4}' -f [int]$_ } else { [string]$_ } })
"sdk.dir=$escaped" | Set-Content -Encoding ASCII android/local.properties
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw '前端构建失败。' }
& npx.cmd cap sync android
if ($LASTEXITCODE -ne 0) { throw 'Capacitor 同步失败。' }
$tasks = @('assembleDebug', 'testDebugUnitTest')
if ($ConnectedTests) { $tasks += 'connectedDebugAndroidTest' }
& ./android/gradlew.bat -p android @tasks --no-daemon
if ($LASTEXITCODE -ne 0) { throw 'Android 构建或测试失败。' }
Write-Output "$workspace/android/app/build/outputs/apk/debug/app-debug.apk"
