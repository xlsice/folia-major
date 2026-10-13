# docs/dev/android-build.ps1
#
# Builds the Folia Android APK (Capacitor shell).
#
# WHY THIS SCRIPT EXISTS -- the two environment traps on this machine:
#   1. The system `java` is JDK 17, but Capacitor 8 compiles with Java 21.
#      Using JDK 17 makes Gradle fail with "invalid source release: 21".
#      Android Studio bundles JBR 21, so we point JAVA_HOME at it.
#   2. ANDROID_HOME / ANDROID_SDK_ROOT are both empty in this shell, so Gradle
#      cannot find the SDK unless we set them explicitly.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File docs\dev\android-build.ps1
#   powershell -ExecutionPolicy Bypass -File docs\dev\android-build.ps1 -Release
#
# NOTE: kept in ASCII on purpose. PowerShell 5.1 reads .ps1 as ANSI unless the
# file has a UTF-8 BOM, so any non-ASCII character here would be mangled.

param(
    [switch]$Release,
    [switch]$SkipWebBuild
)

# 'Continue', not 'Stop': native tools (java, gradlew, npx) write normal output to
# stderr -- `java -version` prints the version to stderr -- and 'Stop' turns that
# into a terminating NativeCommandError before the build even starts. Real failures
# are caught explicitly below via $LASTEXITCODE and throw.
$ErrorActionPreference = 'Continue'

# This script lives in <repo>\docs\dev, so the repo root is TWO levels up.
# Split-Path -Parent only goes one level -- stopping at <repo>\docs makes every
# npx call below run without a capacitor.config.ts, which surfaces as the
# misleading "android platform has not been added yet".
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repo

# Fail loudly here rather than deep inside the CLI.
if (-not (Test-Path (Join-Path $repo 'capacitor.config.ts'))) {
    throw "capacitor.config.ts not found under $repo -- resolved the wrong repo root."
}
Write-Host "=== repo root: $repo ===" -ForegroundColor Cyan

# --- Toolchain env -----------------------------------------------------------
$javaHome = 'C:\Program Files\Android\Android Studio\jbr'
$sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'

if (-not (Test-Path $javaHome)) {
    throw "Android Studio JBR not found at: $javaHome"
}
if (-not (Test-Path $sdkRoot)) {
    throw "Android SDK not found at: $sdkRoot"
}

$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:PATH = "$javaHome\bin;$env:PATH"

Write-Host '=== toolchain ===' -ForegroundColor Cyan
& java -version 2>&1 | ForEach-Object { Write-Host "  $_" }
Write-Host "  JAVA_HOME     = $env:JAVA_HOME"
Write-Host "  ANDROID_HOME  = $sdkRoot"

# --- 1. Web build into dist/ -------------------------------------------------
# VITE_ANDROID_BUILD=1 activates dev/android/stripCdnImportmapPlugin.mjs, which
# removes the aistudiocdn.com importmap so react and friends are bundled locally
# instead of fetched from Google's CDN on cold start.
if (-not $SkipWebBuild) {
    Write-Host '=== 1/3 vite build (android mode) ===' -ForegroundColor Cyan
    $env:VITE_ANDROID_BUILD = '1'
    # Skips `build:vercel-api`: those are Vercel serverless functions and are not
    # part of the APK, so there is no reason to pay the tsc cost here.
    & npx vite build
    if ($LASTEXITCODE -ne 0) { throw "vite build failed (exit $LASTEXITCODE)" }
} else {
    Write-Host '=== 1/3 vite build SKIPPED ===' -ForegroundColor Yellow
}

# --- 2. Sync web assets + plugins into the native project --------------------
Write-Host '=== 2/3 capacitor sync ===' -ForegroundColor Cyan
& npx cap sync android
if ($LASTEXITCODE -ne 0) { throw "cap sync failed (exit $LASTEXITCODE)" }

# --- 3. Gradle assemble ------------------------------------------------------
Write-Host '=== 3/3 gradle ===' -ForegroundColor Cyan
Push-Location (Join-Path $repo 'android')
try {
    $task = if ($Release) { 'assembleRelease' } else { 'assembleDebug' }
    # Single string, not an array: Start-Process-style array quoting does not
    # apply, and passing the wrapper path with spaces needs the call operator.
    & ".\gradlew.bat" $task '--console=plain'
    if ($LASTEXITCODE -ne 0) { throw "gradle $task failed (exit $LASTEXITCODE)" }
} finally {
    Pop-Location
}

$apkDir = Join-Path $repo 'android\app\build\outputs\apk'
Write-Host ''
Write-Host '=== APK output ===' -ForegroundColor Green
if (Test-Path $apkDir) {
    Get-ChildItem $apkDir -Recurse -Filter *.apk |
        ForEach-Object { Write-Host ("  {0}  ({1:N1} MB)" -f $_.FullName, ($_.Length / 1MB)) }
} else {
    Write-Host "  (no apk directory at $apkDir)"
}
