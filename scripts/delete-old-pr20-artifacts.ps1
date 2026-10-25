# Delete only the old LearnHarness PR20 portable ZIP artifacts from GitHub Actions.
# Does NOT touch any source code, PRs, branches, releases, workflows, local files,
# DAGs, conversations, or other actions artifacts.
# Requires: GitHub CLI installed and authenticated on YOUR computer.
#   winget install --id GitHub.cli --exact
#   gh auth login
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\delete-old-pr20-artifacts.ps1
param([string]$Repository = "Anshuman-Arun/learnharness-private")
$ErrorActionPreference = "Stop"
if (-not (Get-Command gh.exe -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI not installed. Run: winget install --id GitHub.cli --exact; then reopen PowerShell."
}
& gh.exe auth status -h github.com
if ($LASTEXITCODE -ne 0) {
    throw "Sign in first using: gh auth login"
}
$ids = @(
    & gh.exe api --paginate "repos/$Repository/actions/artifacts?per_page=100" --jq '.artifacts[] | select(.name == "learnharness-pr20-portable-windows") | .id'
)
if ($LASTEXITCODE -ne 0) { throw "Could not list GitHub Actions artifacts." }
$ids = @($ids | Where-Object { $_ -match '^\d+$' } | Sort-Object -Unique)
Write-Host "Found $($ids.Count) old PR20 portable ZIP artifact(s) to remove."
$deleted = 0
foreach ($id in $ids) {
    & gh.exe api --method DELETE "repos/$Repository/actions/artifacts/$id"
    if ($LASTEXITCODE -ne 0) { throw "Deletion failed for artifact ID $id (already deleted: $deleted)." }
    $deleted++
    Write-Host "Deleted old portable ZIP artifact ID $id"
}
Write-Host "Deleted $deleted old PR20 portable artifacts. GitHub can take 6–12 hours to recalculate storage quotas." -ForegroundColor Green
