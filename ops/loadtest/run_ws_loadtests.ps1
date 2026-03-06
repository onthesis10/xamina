param(
    [string]$WsUrl = "ws://localhost:8080",
    [string]$ApiUrl = "http://localhost:8080",
    [string]$ExamId = "00000000-0000-0000-0000-000000000001",
    [string]$Token = "test-token"
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
        [string]$WsUrl,
        [string]$ApiUrl,
        [string]$ExamId,
        [string]$Token
    )

    $env:WS_URL = $WsUrl
    $env:API_URL = $ApiUrl
    $env:EXAM_ID = $ExamId
    $env:TOKEN = $Token

    k6 run $ScriptPath --summary-export $SummaryPath *> $LogPath
    if ($LASTEXITCODE -ne 0) {
        throw "k6 host run failed for $ScriptPath with exit code $LASTEXITCODE"
    }
}

function Invoke-DockerK6 {
    param(
        [string]$ScriptPath,
        [string]$ScriptFileName,
        [string]$SummaryPath,
        [string]$SummaryFileName,
        [string]$LogPath,
        [string]$WsUrl,
        [string]$ApiUrl,
        [string]$ExamId,
        [string]$Token,
        [string]$LoadtestDir,
        [string]$ReportDir
    )

    $wsForDocker = Convert-UrlForDocker $WsUrl
    $apiForDocker = Convert-UrlForDocker $ApiUrl

    $dockerArgs = @(
        "run", "--rm", "-i",
        "-e", "WS_URL=$wsForDocker",
        "-e", "API_URL=$apiForDocker",
        "-e", "EXAM_ID=$ExamId",
        "-e", "TOKEN=$Token",
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
$metaPath = Join-Path $reportDir "ws-load-meta-$timestamp.txt"
$loadSummary = Join-Path $reportDir "k6-ws-load-summary-$timestamp.json"
$loadLog = Join-Path $reportDir "k6-ws-load-$timestamp.log"
$latencySummary = Join-Path $reportDir "k6-ws-latency-summary-$timestamp.json"
$latencyLog = Join-Path $reportDir "k6-ws-latency-$timestamp.log"

$loadScript = Join-Path $loadtestDir "k6-ws-loadtest.js"
$latencyScript = Join-Path $loadtestDir "k6-ws-latency.js"

$k6 = Get-Command k6 -ErrorAction SilentlyContinue
$docker = Get-Command docker -ErrorAction SilentlyContinue
$runMode = if ($k6) { "host-k6" } elseif ($docker) { "docker-k6" } else { "none" }

@(
    "run_at=$((Get-Date).ToString('o'))",
    "mode=$runMode",
    "ws_url=$WsUrl",
    "api_url=$ApiUrl",
    "exam_id=$ExamId",
    "token_length=$($Token.Length)",
    "k6_path=$($k6.Source)",
    "docker_path=$($docker.Source)"
) | Set-Content -Path $metaPath

if ($runMode -eq "none") {
    throw "Neither host k6 nor docker is available on PATH."
}

Write-Host "Running k6 WS load test ($runMode)..."
if ($runMode -eq "host-k6") {
    Invoke-HostK6 `
        -ScriptPath $loadScript `
        -SummaryPath $loadSummary `
        -LogPath $loadLog `
        -WsUrl $WsUrl `
        -ApiUrl $ApiUrl `
        -ExamId $ExamId `
        -Token $Token
} else {
    Invoke-DockerK6 `
        -ScriptPath $loadScript `
        -ScriptFileName "k6-ws-loadtest.js" `
        -SummaryPath $loadSummary `
        -SummaryFileName ([System.IO.Path]::GetFileName($loadSummary)) `
        -LogPath $loadLog `
        -WsUrl $WsUrl `
        -ApiUrl $ApiUrl `
        -ExamId $ExamId `
        -Token $Token `
        -LoadtestDir $loadtestDir `
        -ReportDir $reportDir
}

Write-Host "Running k6 WS latency test ($runMode)..."
if ($runMode -eq "host-k6") {
    Invoke-HostK6 `
        -ScriptPath $latencyScript `
        -SummaryPath $latencySummary `
        -LogPath $latencyLog `
        -WsUrl $WsUrl `
        -ApiUrl $ApiUrl `
        -ExamId $ExamId `
        -Token $Token
} else {
    Invoke-DockerK6 `
        -ScriptPath $latencyScript `
        -ScriptFileName "k6-ws-latency.js" `
        -SummaryPath $latencySummary `
        -SummaryFileName ([System.IO.Path]::GetFileName($latencySummary)) `
        -LogPath $latencyLog `
        -WsUrl $WsUrl `
        -ApiUrl $ApiUrl `
        -ExamId $ExamId `
        -Token $Token `
        -LoadtestDir $loadtestDir `
        -ReportDir $reportDir
}

Write-Host "Reports written to: $reportDir"
