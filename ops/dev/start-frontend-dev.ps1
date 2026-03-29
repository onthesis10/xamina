param(
    [int]$BackendPort
)

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$frontendDir = Join-Path $repoRoot "xamina-frontend"

function Get-ActiveApiPort {
    $apiProcess = Get-Process api -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $apiProcess) {
        return $null
    }

    $connections = Get-NetTCPConnection -State Listen -OwningProcess $apiProcess.Id -ErrorAction SilentlyContinue |
        Sort-Object LocalPort

    if (-not $connections) {
        return $null
    }

    $preferred = $connections | Where-Object { $_.LocalPort -ge 1024 } | Select-Object -First 1
    if ($preferred) {
        return [int]$preferred.LocalPort
    }

    return [int]($connections | Select-Object -First 1).LocalPort
}

if (-not $BackendPort) {
    $BackendPort = Get-ActiveApiPort
}

if (-not $BackendPort) {
    $BackendPort = 8080
}

$env:VITE_API_PROXY_TARGET = "http://127.0.0.1:$BackendPort"

Write-Host "Frontend dev proxy -> $env:VITE_API_PROXY_TARGET"
Write-Host "Frontend URL      -> http://127.0.0.1:5173"

Push-Location $frontendDir
try {
    npm run dev -- --host 127.0.0.1
}
finally {
    Pop-Location
}
