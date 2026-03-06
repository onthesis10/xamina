param(
    [string]$ApiUrl = "http://127.0.0.1:8080",
    [string]$DatabaseUrl = "postgres://postgres:postgres@localhost:55432/xamina",
    [string]$RedisUrl = "redis://localhost:56379",
    [string]$TenantSlug = "ws-force",
    [string]$MonitorEmail = "ws-monitor@xamina.local",
    [string]$MonitorPassword = "WsPass123!",
    [string]$StudentEmail = "ws-student@xamina.local",
    [string]$StudentPassword = "WsPass123!",
    [string]$ExamId = "22222222-2222-2222-2222-222222222222",
    [string]$QuestionId = "33333333-3333-3333-3333-333333333333",
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
$metaPath = Join-Path $reportDir "ws-force-submit-network-meta-$timestamp.txt"
$checkJson = Join-Path $reportDir "ws-force-submit-network-result-$timestamp.json"
$checkLog = Join-Path $reportDir "ws-force-submit-network-run-$timestamp.log"
$apiLog = Join-Path $reportDir "ws-force-submit-network-api-$timestamp.log"
$apiErrLog = Join-Path $reportDir "ws-force-submit-network-api-$timestamp.err.log"

$apiProc = $null

try {
    Push-Location $repoRoot

    @(
        "run_at=$((Get-Date).ToString('o'))",
        "api_url=$ApiUrl",
        "database_url=$DatabaseUrl",
        "redis_url=$RedisUrl",
        "tenant_slug=$TenantSlug",
        "monitor_email=$MonitorEmail",
        "student_email=$StudentEmail",
        "exam_id=$ExamId",
        "question_id=$QuestionId"
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
        "20260225105400_schema_app_and_superadmin_seed.sql"
    )
    foreach ($file in $migrationFiles) {
        $path = Join-Path $backendDir "crates\db\migrations\$file"
        Get-Content -Raw $path | docker exec -i $PostgresContainer psql -U postgres -d xamina -v ON_ERROR_STOP=1 | Out-Null
    }

    Write-Host "Seeding tenant/users/exam/question..."
    $monitorId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    $studentId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    $seedSql = @"
INSERT INTO tenants (name, slug, plan, is_active)
VALUES ('WS Force Tenant', '$TenantSlug', 'starter', TRUE)
ON CONFLICT (slug) DO UPDATE SET is_active = TRUE;

INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_active)
SELECT '$monitorId', t.id, '$MonitorEmail', '$MonitorPassword', 'WS Monitor', 'guru', TRUE
FROM tenants t
WHERE t.slug = '$TenantSlug'
ON CONFLICT (tenant_id, email)
DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    is_active = TRUE;

INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_active)
SELECT '$studentId', t.id, '$StudentEmail', '$StudentPassword', 'WS Student', 'siswa', TRUE
FROM tenants t
WHERE t.slug = '$TenantSlug'
ON CONFLICT (tenant_id, email)
DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    is_active = TRUE;

INSERT INTO questions (id, tenant_id, created_by, type, content, options_jsonb, answer_key, is_active)
SELECT '$QuestionId', t.id, '$monitorId', 'multiple_choice', 'WS Force Q1',
       '[{"id":"A","label":"A"},{"id":"B","label":"B"}]'::jsonb,
       '"A"'::jsonb,
       TRUE
FROM tenants t
WHERE t.slug = '$TenantSlug'
ON CONFLICT (id) DO UPDATE SET
    content = EXCLUDED.content,
    options_jsonb = EXCLUDED.options_jsonb,
    answer_key = EXCLUDED.answer_key,
    updated_at = NOW();

INSERT INTO exams (id, tenant_id, created_by, title, description, duration_minutes, pass_score, status, start_at, end_at)
SELECT '$ExamId', t.id, '$monitorId', 'WS Force Exam', 'Force-submit network test', 30, 70, 'published',
       NOW() - interval '5 minutes',
       NOW() + interval '30 minutes'
FROM tenants t
WHERE t.slug = '$TenantSlug'
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    duration_minutes = EXCLUDED.duration_minutes,
    pass_score = EXCLUDED.pass_score,
    status = EXCLUDED.status,
    start_at = EXCLUDED.start_at,
    end_at = EXCLUDED.end_at,
    updated_at = NOW();

INSERT INTO exam_questions (exam_id, question_id, order_no)
VALUES ('$ExamId', '$QuestionId', 1)
ON CONFLICT (exam_id, question_id) DO UPDATE SET order_no = EXCLUDED.order_no;

DELETE FROM submissions
WHERE exam_id = '$ExamId'
  AND student_id = '$studentId';
"@
    $seedSql | docker exec -i $PostgresContainer psql -U postgres -d xamina -v ON_ERROR_STOP=1 | Out-Null

    $apiPort = [int]([System.Uri]$ApiUrl).Port
    Write-Host "Starting API instance on port $apiPort..."
    $apiProc = Start-ApiInstance `
        -BackendDir $backendDir `
        -Port $apiPort `
        -DatabaseUrl $DatabaseUrl `
        -RedisUrl $RedisUrl `
        -LogPath $apiLog `
        -ErrorLogPath $apiErrLog
    Wait-ApiHealth -HealthUrl "$ApiUrl/health" -TimeoutSeconds 90

    Write-Host "Running force-submit network validation..."
    $nodeScript = Join-Path $repoRoot "ops\loadtest\ws-force-submit-network-check.mjs"
    $rawResult = & node $nodeScript `
        --apiUrl $ApiUrl `
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
        throw "Force-submit network validation script failed. See $checkJson"
    }

    $parsed = $rawResultText | ConvertFrom-Json
    if (-not $parsed.success) {
        throw "Force-submit network validation result is not successful. See $checkJson"
    }

    Write-Host "Force-submit network validation passed. Result: $checkJson"
} finally {
    if ($apiProc -and -not $apiProc.HasExited) {
        Stop-Process -Id $apiProc.Id -Force
    }
    Pop-Location
}
