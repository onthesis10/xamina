param(
    [string]$TestDatabaseUrl = "postgres://postgres:postgres@localhost:55433/xamina_test?sslmode=disable"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$reportDir = Join-Path $repoRoot "ops\load\reports"
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$summaryPath = Join-Path $reportDir "sprint12-runtime-evidence-$timestamp.json"
$backendLog = Join-Path $reportDir "sprint12-backend-gates-$timestamp.log"
$frontendLog = Join-Path $reportDir "sprint12-frontend-gates-$timestamp.log"

function Invoke-Gate {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string[]]$Command,
        [Parameter(Mandatory = $true)][string]$Workdir,
        [Parameter(Mandatory = $true)][string]$LogPath,
        [hashtable]$Env = @{}
    )

    $previousEnv = @{}
    foreach ($key in $Env.Keys) {
        $previousEnv[$key] = [Environment]::GetEnvironmentVariable($key)
        [Environment]::SetEnvironmentVariable($key, $Env[$key])
    }

    Push-Location $Workdir
    try {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $stdoutPath = [System.IO.Path]::GetTempFileName()
        $stderrPath = [System.IO.Path]::GetTempFileName()
        $cmdLine = $Command -join ' '
        $process = Start-Process `
            -FilePath "cmd.exe" `
            -ArgumentList @("/c", $cmdLine) `
            -WorkingDirectory $Workdir `
            -NoNewWindow `
            -Wait `
            -PassThru `
            -RedirectStandardOutput $stdoutPath `
            -RedirectStandardError $stderrPath
        $stdout = Get-Content $stdoutPath -Raw
        $stderr = Get-Content $stderrPath -Raw
        Remove-Item $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
        $output = @($stdout, $stderr) -join [Environment]::NewLine
        $exitCode = $process.ExitCode
        $sw.Stop()
        Add-Content -Path $LogPath -Value "### $Name"
        Add-Content -Path $LogPath -Value ($output | Out-String)
        [pscustomobject]@{
            name = $Name
            exit_code = $exitCode
            duration_ms = [Math]::Round($sw.Elapsed.TotalMilliseconds, 2)
            passed = ($exitCode -eq 0)
        }
    } finally {
        Pop-Location
        foreach ($key in $Env.Keys) {
            [Environment]::SetEnvironmentVariable($key, $previousEnv[$key])
        }
    }
}

docker compose -f (Join-Path $repoRoot "docker-compose.yml") --profile test up -d postgres-test redis | Out-Null

$backendGates = @()
$frontendGates = @()
$testEnv = @{
    TEST_DATABASE_URL = $TestDatabaseUrl
}

$backendGates += Invoke-Gate -Name "cargo check -p api" -Command @("cargo", "check", "-p", "api") -Workdir (Join-Path $repoRoot "xamina-backend") -LogPath $backendLog -Env $testEnv
$backendGates += Invoke-Gate -Name "cargo test -p api --test question_import_rate_limit_integration --no-run" -Command @("cargo", "test", "-p", "api", "--test", "question_import_rate_limit_integration", "--no-run") -Workdir (Join-Path $repoRoot "xamina-backend") -LogPath $backendLog -Env $testEnv
$backendGates += Invoke-Gate -Name "runtime xlsx preview+commit" -Command @("cargo", "test", "-p", "api", "--test", "question_import_rate_limit_integration", "question_import_preview_and_commit_should_support_xlsx_and_invalid_rows", "--", "--ignored", "--exact") -Workdir (Join-Path $repoRoot "xamina-backend") -LogPath $backendLog -Env $testEnv
$backendGates += Invoke-Gate -Name "runtime docx preview" -Command @("cargo", "test", "-p", "api", "--test", "question_import_rate_limit_integration", "question_import_should_support_docx_and_forbid_student_commit", "--", "--ignored", "--exact") -Workdir (Join-Path $repoRoot "xamina-backend") -LogPath $backendLog -Env $testEnv
$backendGates += Invoke-Gate -Name "runtime rate-limit + compression" -Command @("cargo", "test", "-p", "api", "--test", "question_import_rate_limit_integration", "question_import_rate_limit_and_response_compression_should_work", "--", "--ignored", "--exact") -Workdir (Join-Path $repoRoot "xamina-backend") -LogPath $backendLog -Env $testEnv

$frontendGates += Invoke-Gate -Name "npm run build" -Command @("npm", "run", "build") -Workdir (Join-Path $repoRoot "xamina-frontend") -LogPath $frontendLog
$frontendGates += Invoke-Gate -Name "playwright sprint12 import onboarding" -Command @("npx", "playwright", "test", "e2e/sprint12-import-onboarding.spec.ts", "--project=chromium") -Workdir (Join-Path $repoRoot "xamina-frontend") -LogPath $frontendLog

$summary = [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    test_database_url = $TestDatabaseUrl
    compose_services = @("postgres-test", "redis")
    gates = [ordered]@{
        backend = $backendGates
        frontend = $frontendGates
    }
    profile = [ordered]@{
        xlsx_preview_commit_ms = ($backendGates | Where-Object { $_.name -eq "runtime xlsx preview+commit" } | Select-Object -ExpandProperty duration_ms)
        docx_preview_ms = ($backendGates | Where-Object { $_.name -eq "runtime docx preview" } | Select-Object -ExpandProperty duration_ms)
        rate_limit_compression_ms = ($backendGates | Where-Object { $_.name -eq "runtime rate-limit + compression" } | Select-Object -ExpandProperty duration_ms)
        frontend_playwright_ms = ($frontendGates | Where-Object { $_.name -eq "playwright sprint12 import onboarding" } | Select-Object -ExpandProperty duration_ms)
    }
    artifacts = [ordered]@{
        summary = [IO.Path]::GetFileName($summaryPath)
        backend_log = [IO.Path]::GetFileName($backendLog)
        frontend_log = [IO.Path]::GetFileName($frontendLog)
    }
}

$summary | ConvertTo-Json -Depth 8 | Set-Content $summaryPath
Get-Content $summaryPath
