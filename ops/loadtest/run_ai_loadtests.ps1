param(
    [string]$ApiUrl = "http://localhost:8080/api/v1",
    [string]$TenantSlug = "default",
    [string]$Email = "guru@xamina.local",
    [string]$Password = "Guru123!"
)

$ErrorActionPreference = "Stop"

function Convert-UrlForDocker {
    param([string]$Url)
    if ($Url -match "localhost") {
        return $Url -replace "localhost", "host.docker.internal"
    }
    if ($Url -match "127.0.0.1") {
        return $Url -replace "127.0.0.1", "host.docker.internal"
    }
    return $Url
}

function Invoke-HostK6 {
    param(
        [string]$ScriptPath,
        [string]$SummaryPath,
        [string]$LogPath,
        [string]$ApiUrl,
        [string]$TenantSlug,
        [string]$Email,
        [string]$Password
    )

    $env:API_URL = $ApiUrl
    $env:TENANT_SLUG = $TenantSlug
    $env:EMAIL = $Email
    $env:PASSWORD = $Password

    k6 run $ScriptPath --summary-export $SummaryPath *> $LogPath
    if ($LASTEXITCODE -ne 0) {
        throw "k6 host run failed for $ScriptPath with exit code $LASTEXITCODE"
    }
}

function Invoke-DockerK6 {
    param(
        [string]$ScriptFileName,
        [string]$SummaryFileName,
        [string]$LogPath,
        [string]$ApiUrl,
        [string]$TenantSlug,
        [string]$Email,
        [string]$Password,
        [string]$LoadtestDir,
        [string]$ReportDir
    )

    $apiForDocker = Convert-UrlForDocker $ApiUrl
    $dockerArgs = @(
        "run", "--rm", "-i",
        "-e", "API_URL=$apiForDocker",
        "-e", "TENANT_SLUG=$TenantSlug",
        "-e", "EMAIL=$Email",
        "-e", "PASSWORD=$Password",
        "-v", "${LoadtestDir}:/scripts",
        "-v", "${ReportDir}:/reports",
        "grafana/k6",
        "run",
        "/scripts/$ScriptFileName",
        "--summary-export",
        "/reports/$SummaryFileName"
    )

    docker @dockerArgs *> $LogPath
    if ($LASTEXITCODE -ne 0) {
        throw "k6 docker run failed for $ScriptFileName with exit code $LASTEXITCODE"
    }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$loadtestDir = Join-Path $repoRoot "ops\loadtest"
$reportDir = Join-Path $repoRoot "ops\load\reports"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$metaPath = Join-Path $reportDir "ai-load-meta-$timestamp.txt"
$baselineScript = Join-Path $loadtestDir "k6-ai-baseline.js"
$rateLimitScript = Join-Path $loadtestDir "k6-ai-rate-limit.js"
$baselineSummary = Join-Path $reportDir "k6-ai-baseline-summary-$timestamp.json"
$baselineLog = Join-Path $reportDir "k6-ai-baseline-$timestamp.log"
$rateLimitSummary = Join-Path $reportDir "k6-ai-rate-limit-summary-$timestamp.json"
$rateLimitLog = Join-Path $reportDir "k6-ai-rate-limit-$timestamp.log"

$k6 = Get-Command k6 -ErrorAction SilentlyContinue
$docker = Get-Command docker -ErrorAction SilentlyContinue
$runMode = if ($k6) { "host-k6" } elseif ($docker) { "docker-k6" } else { "none" }

@(
    "run_at=$((Get-Date).ToString('o'))",
    "mode=$runMode",
    "api_url=$ApiUrl",
    "tenant_slug=$TenantSlug",
    "email=$Email",
    "k6_path=$($k6.Source)",
    "docker_path=$($docker.Source)"
) | Set-Content -Path $metaPath

if ($runMode -eq "none") {
    throw "Neither host k6 nor docker is available on PATH."
}

Write-Host "Running AI baseline load test ($runMode)..."
if ($runMode -eq "host-k6") {
    Invoke-HostK6 `
        -ScriptPath $baselineScript `
        -SummaryPath $baselineSummary `
        -LogPath $baselineLog `
        -ApiUrl $ApiUrl `
        -TenantSlug $TenantSlug `
        -Email $Email `
        -Password $Password
} else {
    Invoke-DockerK6 `
        -ScriptFileName "k6-ai-baseline.js" `
        -SummaryFileName ([System.IO.Path]::GetFileName($baselineSummary)) `
        -LogPath $baselineLog `
        -ApiUrl $ApiUrl `
        -TenantSlug $TenantSlug `
        -Email $Email `
        -Password $Password `
        -LoadtestDir $loadtestDir `
        -ReportDir $reportDir
}

Write-Host "Running AI rate-limit test ($runMode)..."
if ($runMode -eq "host-k6") {
    Invoke-HostK6 `
        -ScriptPath $rateLimitScript `
        -SummaryPath $rateLimitSummary `
        -LogPath $rateLimitLog `
        -ApiUrl $ApiUrl `
        -TenantSlug $TenantSlug `
        -Email $Email `
        -Password $Password
} else {
    Invoke-DockerK6 `
        -ScriptFileName "k6-ai-rate-limit.js" `
        -SummaryFileName ([System.IO.Path]::GetFileName($rateLimitSummary)) `
        -LogPath $rateLimitLog `
        -ApiUrl $ApiUrl `
        -TenantSlug $TenantSlug `
        -Email $Email `
        -Password $Password `
        -LoadtestDir $loadtestDir `
        -ReportDir $reportDir
}

Write-Host "AI load test reports written to: $reportDir"
