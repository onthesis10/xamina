<#
.SYNOPSIS
    Xamina Production Smoke Test
.DESCRIPTION
    Runs basic health checks against the Xamina backend API.
    Tests: health endpoint, login, dashboard summary (authenticated).
.PARAMETER BaseUrl
    Base URL of the backend API (default: http://localhost:8080)
.EXAMPLE
    .\smoke-test.ps1
    .\smoke-test.ps1 -BaseUrl "https://api.xamina.id"
#>
param(
    [string]$BaseUrl = $(if ($env:XAMINA_BASE_URL) { $env:XAMINA_BASE_URL } else { "http://localhost:8080" })
)

$ErrorActionPreference = "Continue"
$passed = 0
$failed = 0
$total = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Url,
        [hashtable]$Headers = @{},
        [string]$Body = $null,
        [scriptblock]$Validate
    )

    $script:total++
    Write-Host "`n[$script:total] $Name" -ForegroundColor Cyan
    Write-Host "    $Method $Url" -ForegroundColor DarkGray

    try {
        $params = @{
            Uri     = $Url
            Method  = $Method
            Headers = $Headers
            ContentType = "application/json"
            ErrorAction = "Stop"
        }
        if ($Body) {
            $params.Body = $Body
        }

        $response = Invoke-RestMethod @params
        $result = & $Validate $response

        if ($result) {
            Write-Host "    PASS" -ForegroundColor Green
            $script:passed++
        } else {
            Write-Host "    FAIL - Validation failed" -ForegroundColor Red
            $script:failed++
        }
    }
    catch {
        Write-Host "    FAIL - $($_.Exception.Message)" -ForegroundColor Red
        $script:failed++
    }
}

Write-Host "============================================" -ForegroundColor Yellow
Write-Host "  Xamina Production Smoke Test" -ForegroundColor Yellow
Write-Host "  Target: $BaseUrl" -ForegroundColor Yellow
Write-Host "  Time:   $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Yellow

# ── Test 1: Health Check ──────────────────────────────────────
Test-Endpoint -Name "Health Check" -Method "GET" -Url "$BaseUrl/health" -Validate {
    param($res)
    $res -eq "OK"
}

# ── Test 2: Login with seed credentials ───────────────────────
$loginBody = @{
    email       = "admin@default.local"
    password    = "Password123!"
    tenant_slug = "default"
} | ConvertTo-Json

$accessToken = $null

Test-Endpoint -Name "Login (seed admin)" -Method "POST" -Url "$BaseUrl/api/v1/auth/login" -Body $loginBody -Validate {
    param($res)
    if ($res.success -and $res.data) {
        # Handle both direct auth and challenge-required responses
        if ($res.data.access_token) {
            $script:accessToken = $res.data.access_token
            return $true
        }
        if ($res.data.session -and $res.data.session.access_token) {
            $script:accessToken = $res.data.session.access_token
            return $true
        }
        if ($res.data.challenge_type) {
            Write-Host "    INFO: MFA challenge required (expected in secure environments)" -ForegroundColor Yellow
            return $true
        }
    }
    return $false
}

# ── Test 3: Dashboard Summary (authenticated) ─────────────────
if ($accessToken) {
    Test-Endpoint -Name "Dashboard Summary" -Method "GET" -Url "$BaseUrl/api/v1/dashboard/summary" `
        -Headers @{ Authorization = "Bearer $accessToken" } `
        -Validate {
            param($res)
            $res.success -eq $true
        }
} else {
    Write-Host "`n[3] Dashboard Summary" -ForegroundColor Cyan
    Write-Host "    SKIP - No access token from login" -ForegroundColor Yellow
    $total++
}

# ── Test 4: Metrics endpoint ──────────────────────────────────
Test-Endpoint -Name "Metrics Endpoint" -Method "GET" -Url "$BaseUrl/metrics" -Validate {
    param($res)
    $res -match "axum_http" -or $res -match "requests_total" -or $res.Length -gt 0
}

# ── Summary ───────────────────────────────────────────────────
Write-Host "`n============================================" -ForegroundColor Yellow
Write-Host "  Results: $passed/$total passed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
if ($failed -gt 0) {
    Write-Host "  FAILED: $failed test(s)" -ForegroundColor Red
}
Write-Host "============================================" -ForegroundColor Yellow

exit $failed
