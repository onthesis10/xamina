param(
    [string]$ApiAUrl = "http://127.0.0.1:8080",
    [string]$ApiBUrl = "http://127.0.0.1:8081",
    [string]$DatabaseUrl = "postgres://postgres:postgres@localhost:55432/xamina",
    [string]$RedisUrl = "redis://localhost:56379",
    [string]$TenantSlug = "ws-multi",
    [string]$MonitorEmail = "ws-monitor@xamina.local",
    [string]$MonitorPassword = "WsPass123!",
    [string]$StudentEmail = "ws-student@xamina.local",
    [string]$StudentPassword = "WsPass123!",
    [string]$ExamId = "11111111-1111-1111-1111-111111111111",
    [string]$PostgresContainer = "xamina-postgres-1"
)

$ErrorActionPreference = "Stop"

function Wait-ApiHealth {
    param(
        [string]$HealthUrl,
        [int]$TimeoutSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Method GET -Uri $HealthUrl -UseBasicParsing -TimeoutSec 5
            if ($resp.StatusCode -eq 200) {
                return
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }

    throw "API health check timeout: $HealthUrl"
}

function Start-ApiInstance {
    param(
        [string]$BackendDir,
        [int]$Port,
        [string]$DatabaseUrl,
        [string]$RedisUrl,
        [string]$LogPath,
        [string]$ErrorLogPath
    )

    $command = @(
        "set `"DATABASE_URL=$DatabaseUrl`"",
        "set `"REDIS_URL=$RedisUrl`"",
        "set `"JWT_SECRET=change-me-in-production`"",
        "set `"JWT_ACCESS_TTL_MINUTES=30`"",
        "set `"JWT_REFRESH_TTL_DAYS=14`"",
        "set `"API_HOST=127.0.0.1`"",
        "set `"API_PORT=$Port`"",
        "set `"RUST_LOG=info`"",
        "cargo run -p api"
    ) -join " && "

    return Start-Process `
        -FilePath "cmd.exe" `
        -ArgumentList @("/c", $command) `
        -WorkingDirectory $BackendDir `
        -PassThru `
        -NoNewWindow `
        -RedirectStandardOutput $LogPath `
        -RedirectStandardError $ErrorLogPath
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$backendDir = Join-Path $repoRoot "xamina-backend"
$reportDir = Join-Path $repoRoot "ops\load\reports"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$metaPath = Join-Path $reportDir "ws-multi-instance-meta-$timestamp.txt"
$apiALog = Join-Path $reportDir "ws-multi-instance-api-a-$timestamp.log"
$apiBLog = Join-Path $reportDir "ws-multi-instance-api-b-$timestamp.log"
$apiAErrLog = Join-Path $reportDir "ws-multi-instance-api-a-$timestamp.err.log"
$apiBErrLog = Join-Path $reportDir "ws-multi-instance-api-b-$timestamp.err.log"
$checkJson = Join-Path $reportDir "ws-multi-instance-result-$timestamp.json"
$checkLog = Join-Path $reportDir "ws-multi-instance-run-$timestamp.log"

$apiAProc = $null
$apiBProc = $null

try {
    Push-Location $repoRoot

    @(
        "run_at=$((Get-Date).ToString('o'))",
        "api_a=$ApiAUrl",
        "api_b=$ApiBUrl",
        "database_url=$DatabaseUrl",
        "redis_url=$RedisUrl",
        "tenant_slug=$TenantSlug",
        "monitor_email=$MonitorEmail",
        "student_email=$StudentEmail",
        "exam_id=$ExamId"
    ) | Set-Content -Path $metaPath

    Write-Host "Ensuring postgres and redis are running..."
    docker compose up -d postgres redis | Out-Null

    Write-Host "Applying migrations through postgres container..."
    $migrationFiles = @(
        "0001_extensions.sql",
        "0002_core_auth.sql",
        "0003_questions.sql",
        "0004_exams.sql",
        "0005_submissions.sql",
        "0006_publish_conflict_indexes.sql",
        "0007_notifications.sql",
        "0008_dashboard_indexes.sql",
        "0009_sprint7_multitenant_rls.sql",
        "0010_ai_usage_logs.sql",
        "0011_sprint10_certificates_delivery.sql",
        "0012_sprint10_push_receipts.sql",
        "20260225105400_schema_app_and_superadmin_seed.sql"
    )
    foreach ($file in $migrationFiles) {
        $path = Join-Path $backendDir "crates\db\migrations\$file"
        Get-Content -Raw $path | docker exec -i $PostgresContainer psql -U postgres -d xamina -v ON_ERROR_STOP=1 | Out-Null
    }

    Write-Host "Seeding WS validation tenant/users..."
    $seedSql = @"
INSERT INTO tenants (name, slug, plan, is_active)
VALUES ('WS Multi Tenant', '$TenantSlug', 'starter', TRUE)
ON CONFLICT (slug) DO UPDATE SET is_active = TRUE;

INSERT INTO users (tenant_id, email, password_hash, name, role, is_active)
SELECT id, '$MonitorEmail', '$MonitorPassword', 'WS Monitor', 'guru', TRUE
FROM tenants
WHERE slug = '$TenantSlug'
ON CONFLICT (tenant_id, email)
DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    is_active = TRUE;

INSERT INTO users (tenant_id, email, password_hash, name, role, is_active)
SELECT id, '$StudentEmail', '$StudentPassword', 'WS Student', 'siswa', TRUE
FROM tenants
WHERE slug = '$TenantSlug'
ON CONFLICT (tenant_id, email)
DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    is_active = TRUE;
"@
    $seedSql | docker exec -i $PostgresContainer psql -U postgres -d xamina -v ON_ERROR_STOP=1 | Out-Null

    $apiAPort = [int]([System.Uri]$ApiAUrl).Port
    $apiBPort = [int]([System.Uri]$ApiBUrl).Port

    Write-Host "Starting API instance A on port $apiAPort..."
    $apiAProc = Start-ApiInstance `
        -BackendDir $backendDir `
        -Port $apiAPort `
        -DatabaseUrl $DatabaseUrl `
        -RedisUrl $RedisUrl `
        -LogPath $apiALog `
        -ErrorLogPath $apiAErrLog
    Wait-ApiHealth -HealthUrl "$ApiAUrl/health" -TimeoutSeconds 90

    Write-Host "Starting API instance B on port $apiBPort..."
    $apiBProc = Start-ApiInstance `
        -BackendDir $backendDir `
        -Port $apiBPort `
        -DatabaseUrl $DatabaseUrl `
        -RedisUrl $RedisUrl `
        -LogPath $apiBLog `
        -ErrorLogPath $apiBErrLog
    Wait-ApiHealth -HealthUrl "$ApiBUrl/health" -TimeoutSeconds 90

    Write-Host "Running cross-instance WS validation..."
    $nodeScript = Join-Path $repoRoot "ops\loadtest\ws-cross-instance-check.mjs"
    $rawResult = & node $nodeScript `
        --apiAUrl $ApiAUrl `
        --apiBUrl $ApiBUrl `
        --tenantSlug $TenantSlug `
        --monitorEmail $MonitorEmail `
        --monitorPassword $MonitorPassword `
        --studentEmail $StudentEmail `
        --studentPassword $StudentPassword `
        --examId $ExamId `
        --timeoutMs 20000

    $rawResultText = ($rawResult | Out-String).Trim()
    $rawResultText | Set-Content -Path $checkJson
    $rawResultText | Set-Content -Path $checkLog

    if ($LASTEXITCODE -ne 0) {
        throw "Cross-instance WS validation script failed. See $checkJson"
    }

    $parsed = $rawResultText | ConvertFrom-Json
    if (-not $parsed.success) {
        throw "Cross-instance WS validation result is not successful. See $checkJson"
    }

    Write-Host "Cross-instance WS validation passed. Result: $checkJson"
} finally {
    if ($apiAProc -and -not $apiAProc.HasExited) {
        Stop-Process -Id $apiAProc.Id -Force
    }
    if ($apiBProc -and -not $apiBProc.HasExited) {
        Stop-Process -Id $apiBProc.Id -Force
    }
    Pop-Location
}
