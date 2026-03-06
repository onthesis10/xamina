$ErrorActionPreference = "Stop"
$backendRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$workspaceRoot = Resolve-Path (Join-Path $backendRoot "..")
Set-Location $workspaceRoot
$apiExePath = Join-Path $backendRoot "target\debug\api.exe"

Write-Host "Starting isolated postgres-test + redis containers..."
cmd /c "docker compose --profile test up -d postgres-test redis"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to start postgres-test/redis containers. Ensure Docker daemon is running."
}

Write-Host "Waiting for postgres-test readiness..."
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    cmd /c "docker compose exec -T postgres-test pg_isready -U postgres -d xamina_test >nul 2>nul"
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 1
}

if (-not $ready) {
    throw "postgres-test is not ready after 30 seconds."
}

Write-Host "Waiting for redis readiness..."
$redisReady = $false
for ($i = 0; $i -lt 30; $i++) {
    cmd /c "docker compose exec -T redis redis-cli ping >nul 2>nul"
    if ($LASTEXITCODE -eq 0) {
        $redisReady = $true
        break
    }
    Start-Sleep -Seconds 1
}
if (-not $redisReady) {
    throw "redis is not ready after 30 seconds."
}

$env:TEST_DATABASE_URL = "postgres://postgres:postgres@localhost:55433/xamina_test?sslmode=disable"
$env:XAMINA_DISABLE_METRICS = "1"

# Prevent stale debug API process from locking target\debug\api.exe during cargo test.
$staleApi = Get-Process api -ErrorAction SilentlyContinue | Where-Object {
    try {
        $_.Path -eq $apiExePath
    } catch {
        $false
    }
}
if ($staleApi) {
    Write-Host "Stopping stale api.exe process before integration test..."
    $staleApi | Stop-Process -Force
}

Write-Host "Running integration tests (ignored suite)..."
Set-Location $backendRoot
cargo test -p api --test auth_integration --test exam_publish_integration --test question_exam_crud_integration --test exam_session_integration --test dashboard_report_notification_integration --test user_class_csv_integration --test ai_integration --test sprint10_certificate_notification_integration -- --ignored --nocapture --test-threads=1
$testExitCode = $LASTEXITCODE

if ($testExitCode -ne 0) {
    Write-Error "Integration tests failed with exit code $testExitCode."
    exit $testExitCode
}

Write-Host "Integration tests finished."
