# docs/dev/release-android.ps1
#
# One-shot release pipeline for the Android fork:
#   verify -> secret-scan -> commit -> push -> signed release APK -> verify artifact
#
# WHY THIS IS A SCRIPT AND NOT A CHECKLIST --
#   1. ORDER IS LOAD-BEARING. vite.config.ts stamps the build with
#      `git rev-parse --short HEAD` while vite runs, and that value is what the
#      AGPL-3.0 5(b) notice inside the APK reports as the build id. If you build
#      first and commit after, the binary claims a commit that does not contain
#      it, and the binary/source correspondence required by 6(d) stops being
#      checkable by anyone. So: commit, push, THEN build. Never the other way.
#   2. The push target is pinned to the Android branch. This repo must never
#      receive a push to main (that is the upstream author's branch); a mistyped
#      -Branch here is the single highest-consequence mistake in the pipeline.
#   3. A credential guard runs on the staged diff before the commit, not after.
#      The project rule is that a netease cookie never enters the tree.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File docs\dev\release-android.ps1 -MessageFile docs\dev\.tmp\msg.txt
#   powershell -ExecutionPolicy Bypass -File docs\dev\release-android.ps1 -SkipCommit
#
# WHY ASCII ONLY: PowerShell 5.1 reads .ps1 as ANSI unless the file starts with a
# UTF-8 BOM, so any non-ASCII byte here would be mangled. Same rule as
# android-build.ps1. Chinese commit messages therefore go through -MessageFile,
# written as UTF-8 WITHOUT BOM.

param(
    # Path to a UTF-8 (no BOM) file holding the commit message.
    [string]$MessageFile,

    # Build and verify without committing (use when the commit already exists).
    [switch]$SkipCommit,

    # Skip `npm run typecheck` and the unit suite.
    [switch]$SkipTests
)

$ErrorActionPreference = 'Continue'

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repo
$branch = 'Android'

function Step($msg) { Write-Host '' ; Write-Host "=== $msg ===" -ForegroundColor Cyan }
function Die($msg) { throw $msg }

# --- 0. Guards ----------------------------------------------------------------
Step '0/6 preflight'
if (-not (Test-Path (Join-Path $repo 'capacitor.config.ts'))) {
    Die "capacitor.config.ts not found under $repo -- resolved the wrong repo root."
}

$current = (& git rev-parse --abbrev-ref HEAD).Trim()
if ($current -ne $branch) {
    Die "HEAD is on '$current', expected '$branch'. This pipeline only ever touches $branch."
}
if ((git remote) -notcontains 'origin') {
    Die "no 'origin' remote."
}
$originUrl = (git remote get-url origin).Trim()
Write-Host "  branch   = $current"
Write-Host "  origin   = $originUrl"

# --- 1. Static verification ---------------------------------------------------
if (-not $SkipTests) {
    Step '1/6 typecheck + unit tests'
    & npm run typecheck
    if ($LASTEXITCODE -ne 0) { Die "typecheck failed (exit $LASTEXITCODE)" }

    & npx vitest run test/unit/library
    if ($LASTEXITCODE -ne 0) { Die "unit tests failed (exit $LASTEXITCODE)" }
} else {
    Step '1/6 typecheck + unit tests SKIPPED'
}

# --- 2. Commit (with credential guard) ---------------------------------------
Step '2/6 commit'
if ($SkipCommit) {
    Write-Host '  skipped by -SkipCommit'
} else {
    if (-not $MessageFile) { Die '-MessageFile is required unless -SkipCommit is passed.' }
    if (-not (Test-Path $MessageFile)) { Die "message file not found: $MessageFile" }

    & git add -A
    if ($LASTEXITCODE -ne 0) { Die "git add failed" }

    $staged = (& git diff --cached --name-only)
    if (-not $staged) {
        Write-Host '  nothing staged; keeping the existing HEAD.'
    } else {
        Write-Host '  staged:'
        $staged | ForEach-Object { Write-Host "    $_" }

        # Credential guard, run on the staged diff BEFORE the commit lands.
        #
        # Two separate checks, because a single content regex cannot work here:
        # this script's own source contains the very patterns it looks for, so a
        # plain literal would make the guard fire on itself every run. The
        # literals are therefore assembled from fragments below.
        #
        #   (a) staged PATHS -- key material must never enter the tree at all.
        #   (b) staged CONTENT -- credential-shaped strings in the code.
        $patch = (& git diff --cached)
        $badPaths = $staged | Select-String -Pattern '\.jks$|\.keystore$|keystore\.properties$|(^|/)\.env'
        if ($badPaths) {
            Write-Host ''
            Write-Host '  !! key material staged:' -ForegroundColor Red
            $badPaths | ForEach-Object { Write-Host "     $($_.Line)" -ForegroundColor Red }
            Die 'refusing to commit: signing keys / keystore must stay out of the tree.'
        }

        $secretLiterals = @(
            ('MUSIC' + '_U'), ('MUSIC' + '_R'), ('__' + 'csrf'),
            ('Bear' + 'er\s+[A-Za-z0-9._-]{8,}'),
            ('BEGIN [A-Z ]*PRIV' + 'ATE KEY')
        )
        $bad = $patch | Select-String -Pattern $secretLiterals -CaseSensitive:$false
        if ($bad) {
            Write-Host ''
            Write-Host '  !! credential-like content in the staged diff:' -ForegroundColor Red
            $bad | Select-Object -First 20 | ForEach-Object { Write-Host "     $($_.Line)" -ForegroundColor Red }
            Die 'refusing to commit: credential-like content found (unstage it and confirm it is not a real secret).'
        }

        & git commit -F $MessageFile
        if ($LASTEXITCODE -ne 0) { Die "commit failed (exit $LASTEXITCODE)" }
    }
}

$commit = (& git rev-parse HEAD).Trim()
$short = (& git rev-parse --short HEAD).Trim()
Write-Host "  HEAD = $commit ($short)"

# --- 3. Push ------------------------------------------------------------------
Step "3/6 push origin $branch"
& git push origin $branch
if ($LASTEXITCODE -ne 0) { Die "push failed (exit $LASTEXITCODE)" }
$remoteHead = (& git rev-parse "origin/$branch").Trim()
if ($remoteHead -ne $commit) { Die "origin/$branch is at $remoteHead, local is $commit." }
Write-Host "  origin/$branch = $remoteHead"

# --- 4. Signed release build --------------------------------------------------
Step '4/6 signed release build'
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'android-build.ps1') -Release
if ($LASTEXITCODE -ne 0) { Die "android-build.ps1 -Release failed (exit $LASTEXITCODE)" }

$apk = Join-Path $repo 'android\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path $apk)) { Die "release APK not found at $apk" }

# --- 5. Verify the artifact ---------------------------------------------------
Step '5/6 artifact verification'
$len = (Get-Item $apk).Length
$sha = (Get-FileHash -Path $apk -Algorithm SHA256).Hash.ToLower()
Write-Host ("  path    = {0}" -f $apk)
Write-Host ("  size    = {0:N0} bytes ({1:N2} MiB)" -f $len, ($len / 1MB))
Write-Host ("  sha256  = {0}" -f $sha)

$sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$apksigner = Get-ChildItem (Join-Path $sdkRoot 'build-tools') -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'apksigner.bat' } |
    Where-Object { Test-Path $_ } | Select-Object -First 1
if ($apksigner) {
    & $apksigner verify --print-certs $apk | Select-String 'Signer #1 certificate DN|SHA-256 digest' |
        ForEach-Object { Write-Host "  $($_.Line.Trim())" }
} else {
    Write-Host '  apksigner not found -- signature NOT verified (check build-tools install).' -ForegroundColor Yellow
}

# 5(b) notice + build id must actually be inside the shipped JS bundle.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($apk)
try {
    $needles = @('data-license-source-url', 'data-license-build', 'data-license-notice', $short)
    $hits = @{}
    foreach ($needle in $needles) { $hits[$needle] = 0 }
    foreach ($entry in $zip.Entries) {
        if ($entry.FullName -notlike 'assets/*.js') { continue }
        $reader = New-Object System.IO.StreamReader($entry.Open())
        try { $body = $reader.ReadToEnd() } finally { $reader.Dispose() }
        foreach ($needle in $needles) {
            if ($body.Contains($needle)) { $hits[$needle] = $hits[$needle] + 1 }
        }
    }
    foreach ($needle in $needles) {
        $mark = if ($hits[$needle] -gt 0) { 'OK  ' } else { 'MISS' }
        $color = if ($hits[$needle] -gt 0) { 'Green' } else { 'Red' }
        Write-Host ("  [{0}] {1} in assets/*.js  ({2} file(s))" -f $mark, $needle, $hits[$needle]) -ForegroundColor $color
    }
    if ($hits[$short] -eq 0) {
        Die "commit $short is not embedded in the APK -- the binary would not match the source it claims."
    }
} finally {
    $zip.Dispose()
}

Step '6/6 done'
Write-Host ("  APK ready to upload: {0}" -f $apk) -ForegroundColor Green
Write-Host "  Next: tag + GitHub Release. The tag MUST point at $commit." -ForegroundColor Green
Write-Host "  (AGPL 6(d): the release page must carry this APK and the matching free source.)" -ForegroundColor Green
