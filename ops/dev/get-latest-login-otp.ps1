param(
    [string]$Email = "admin@xamina.local"
)

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backendDir = Join-Path $repoRoot "xamina-backend"

Push-Location $backendDir
try {
    cargo run -p api --bin dev_auth_debug -- $Email
}
finally {
    Pop-Location
}
