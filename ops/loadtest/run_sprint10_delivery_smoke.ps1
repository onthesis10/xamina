param(
    [string]$ApiBaseUrl = "http://127.0.0.1:8080/api/v1",
    [string]$Token = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Token)) {
    throw "Token is required. Pass -Token '<bearer-token>'"
}

$headers = @{
    Authorization = "Bearer $Token"
    "Content-Type" = "application/json"
}

$payload = @{
    title = "Sprint10 Smoke"
    message = "Ini smoke broadcast delivery Sprint 10."
    target_roles = @("siswa")
    send_push = $true
} | ConvertTo-Json -Depth 5

$broadcastUrl = "$ApiBaseUrl/notifications/broadcast"
$resp = Invoke-RestMethod -Method POST -Uri $broadcastUrl -Headers $headers -Body $payload -TimeoutSec 20

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportDir = Join-Path (Resolve-Path "$PSScriptRoot\..\load\reports") "."
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
$outPath = Join-Path $reportDir "sprint10-delivery-smoke-$timestamp.json"
$resp | ConvertTo-Json -Depth 8 | Set-Content $outPath

Write-Host "Broadcast smoke response saved: $outPath"
Write-Host "Mailpit UI (local): http://localhost:8025"
