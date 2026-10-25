# Build Batch A's Next.js server locally on Windows and optionally graft it
# into a copy of the PREVIOUS working PR20 portable executable. This avoids
# waiting for GitHub Actions artifact uploads. Run from an extracted copy of
# the *experimental branch source ZIP*, never from a portable app directory.
#
# Fast path (requires the previously extracted LearnHarness PR20 Test):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-private-windows.ps1 -ExistingPortablePath "C:\path\to\old\win-unpacked"
#
# Fresh full portable build (does not require the old application):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-private-windows.ps1
#
# Keeps all data under %APPDATA%\LearnHarness PR20 Test untouched.
param(
    [string]$ExistingPortablePath = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Invoke-Step([string]$Name, [scriptblock]$Command) {
    Write-Host ""
    Write-Host "===== $Name =====" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed (exit code $LASTEXITCODE)"
    }
}

function Copy-VerifiedTree([string]$From, [string]$To, [string]$Name) {
    New-Item -ItemType Directory -Path $To -Force | Out-Null
    Write-Host "Copying $Name..."
    & robocopy.exe $From $To /MIR /R:2 /W:1 /NP /NFL /NDL /NJH /NJS
    $code = $LASTEXITCODE
    if ($code -gt 7) { throw "Copying $Name failed (robocopy exit code $code)." }
    $global:LASTEXITCODE = 0
}

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
foreach ($tool in @("node.exe", "npm.cmd", "npx.cmd")) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "$tool not found. Install Node.js 26 from https://nodejs.org/ and reopen PowerShell."
    }
}
$nodeVersion = (& node.exe --version).Trim()
Write-Host "Node.js $nodeVersion — CI uses Node 26."
if ([int]($nodeVersion -replace '^v(\d+).*', '$1') -lt 26) {
    Write-Warning "Use Node.js 26 for exact parity with the passing GitHub CI."
}

if (-not (Test-Path -LiteralPath (Join-Path $root "scripts\pr20-isolate-package.mjs"))) {
    throw "Wrong directory: select the EXTRACTED SOURCE ZIP, not the existing portable app."
}
if (-not (Test-Path -LiteralPath (Join-Path $root "package-lock.json"))) {
    throw "Missing package-lock.json. Download the full source branch ZIP."
}

Push-Location $root
try {
    Invoke-Step "Install dependencies" { & npm.cmd ci }
    Invoke-Step "Build updated Next.js server" { & npm.cmd run build }
    Invoke-Step "Include static files, check secret exclusions" { & node.exe scripts/build-server.mjs }
    Invoke-Step "Boot and smoke-test updated server" { & node.exe scripts/smoke-server.mjs --electron }

    $standalone = Join-Path $root ".next\standalone"
    if (-not (Test-Path -LiteralPath (Join-Path $standalone ".next\BUILD_ID"))) {
        throw "Updated server missing .next/BUILD_ID; refusing to produce broken app."
    }
    if (-not (Test-Path -LiteralPath (Join-Path $standalone ".next\static"))) {
        throw "Updated server missing .next/static; refusing to produce broken app."
    }

    if ($ExistingPortablePath.Trim().Length -gt 0) {
        # The source was verified against the last successful f1c1583 build:
        # Batch A alters server/renderer code only, not the Electron shell.
        $old = (Resolve-Path -LiteralPath $ExistingPortablePath).Path.TrimEnd('\')
        $oldExe = Join-Path $old "LearnHarness PR20 Test.exe"
        $oldAsar = Join-Path $old "resources\app.asar"
        if (-not (Test-Path -LiteralPath $oldExe) -or -not (Test-Path -LiteralPath $oldAsar)) {
            throw "ExistingPortablePath must be the folder containing 'LearnHarness PR20 Test.exe' and resources/app.asar."
        }
        $output = Join-Path $root "dist\pr20-local-updated"
        if ($old -eq $output -or $old.StartsWith($output + '\') -or $output.StartsWith($old + '\')) {
            throw "Old and output application paths overlap. Move the old portable app outside the source directory."
        }
        Copy-VerifiedTree $old $output "previous portable shell into a NEW folder"
        $serverOutput = Join-Path $output "resources\server\standalone"
        Copy-VerifiedTree $standalone $serverOutput "updated standalone Next.js server"
        $exe = Join-Path $output "LearnHarness PR20 Test.exe"
    } else {
        $main = Get-Content -LiteralPath (Join-Path $root "electron\main.cjs") -Raw
        if ($main -notmatch 'const PRODUCT_NAME = "LearnHarness PR20 Test";') {
            Invoke-Step "Set isolated private app identity (disable upstream auto-updater)" {
                & node.exe scripts/pr20-isolate-package.mjs
            }
        }
        Invoke-Step "Package fresh portable Windows app (no installer / upload)" {
            & npx.cmd --no-install electron-builder --win --x64 --dir --publish never
        }
        $output = Join-Path $root "dist\win-unpacked"
        $serverOutput = Join-Path $output "resources\server\standalone"
        $exe = Join-Path $output "LearnHarness PR20 Test.exe"
    }

    foreach ($necessary in @(
        $exe,
        (Join-Path $output "resources\app.asar"),
        (Join-Path $serverOutput "server.js"),
        (Join-Path $serverOutput ".next\BUILD_ID"),
        (Join-Path $serverOutput ".next\static")
    )) {
        if (-not (Test-Path -LiteralPath $necessary)) {
            throw "Updated portable app is incomplete: $necessary"
        }
    }
    Write-Host ""
    Write-Host "SUCCESS: updated Batch A portable app assembled locally." -ForegroundColor Green
    Write-Host "Launch: $exe" -ForegroundColor Green
    Write-Host "User data location unchanged: $env:APPDATA\LearnHarness PR20 Test"
    Write-Host "Close the previous app completely before opening this one."
} finally {
    Pop-Location
}
