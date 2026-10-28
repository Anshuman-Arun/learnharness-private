# Safe, reproducible full Windows build from current source.
# Never graft a new Next.js bundle into an older Electron OAuth executable.
param([string]$ExistingPortablePath = "")
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
if ($ExistingPortablePath.Trim()) {
    throw "Old executable grafting is retired: it can ship stale OAuth code. Use a complete fresh build without -ExistingPortablePath."
}
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
Push-Location $root
try {
    foreach ($tool in @("node.exe", "npm.cmd", "npx.cmd")) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Missing $tool. Install Node.js 26." }
    }
    $nodeVersion = (& node.exe -p "process.versions.node.split('.')[0]").Trim()
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -ne "26") { throw "Node.js 26 required for verified CI parity." }
    function Step([string]$name, [scriptblock]$run) {
        Write-Host "==== $name ====" -ForegroundColor Cyan
        & $run
        if ($LASTEXITCODE -ne 0) { throw "$name failed (exit code $LASTEXITCODE)" }
    }
    Step "Install reproducible dependencies" { & npm.cmd ci }
    Step "Typecheck" { & npm.cmd run typecheck }
    Step "Lint" { & npm.cmd run lint }
    Step "PR20 OAuth and billing security tests" {
        & node.exe --import tsx --test tests/chatgpt-oauth.test.ts tests/chatgpt-pr20-broker.test.ts tests/pr20-billing-isolation.test.ts tests/desktop-platform.test.ts tests/auth-provider-keys.test.ts tests/private-release-policy.test.ts
    }
    Step "Build Next.js" { & npm.cmd run build }
    Step "Bundle standalone server" { & node.exe scripts/build-server.mjs }
    Step "Boot/smoke test server" { & node.exe scripts/smoke-server.mjs --electron }
    Step "Verify private identity and no updater/feed" { & node.exe scripts/pr20-isolate-package.mjs }
    Step "Build full portable Electron application" { & npx.cmd --no-install electron-builder --win --x64 --dir --publish never }
    $output = Join-Path $root "dist\win-unpacked"
    foreach ($required in @(
        "LearnHarness Private.exe",
        "resources\app.asar",
        "resources\server\standalone\server.js",
        "resources\server\standalone\.next\BUILD_ID",
        "resources\server\standalone\.next\static"
    )) {
        if (-not (Test-Path -LiteralPath (Join-Path $output $required))) { throw "Incomplete portable build: $required" }
    }
    Write-Host "Portable build verified: $output\LearnHarness Private.exe" -ForegroundColor Green
    Write-Host "The old PR20 Test and upstream data directories have NOT been migrated."
} finally { Pop-Location }
