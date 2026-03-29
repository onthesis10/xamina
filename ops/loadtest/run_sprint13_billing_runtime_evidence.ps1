param(
    [string]$ApiBaseUrl = "http://127.0.0.1:18080/api/v1",
    [string]$TestDatabaseUrl = "postgres://postgres:postgres@localhost:55433/xamina_test?sslmode=disable",
    [string]$RedisUrl = "redis://localhost:56379",
    [string]$TenantSlug = "default",
    [string]$AdminEmail = "admin@xamina.local",
    [string]$AdminPassword = "Admin123!"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$backendDir = Join-Path $repoRoot "xamina-backend"
$composeFile = Join-Path $repoRoot "docker-compose.yml"
$reportDir = Join-Path $repoRoot "ops\load\reports"
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$summaryPath = Join-Path $reportDir "sprint13-runtime-evidence-$timestamp.json"
$apiStdoutPath = Join-Path $reportDir "sprint13-api-runtime-$timestamp.log"
$apiStderrPath = Join-Path $reportDir "sprint13-api-runtime-$timestamp.err.log"
$pdfPath = Join-Path $reportDir "sprint13-invoice-$timestamp.pdf"
$midtransPreflightPath = Join-Path $reportDir "sprint13-midtrans-preflight-$timestamp.txt"

function Get-EnvValueFromFile {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string]$Key
    )

    if (-not (Test-Path $FilePath)) {
        return $null
    }

    foreach ($line in Get-Content $FilePath) {
        if ($line -match '^\s*#') {
            continue
        }
        if ($line -match "^\s*$Key=(.*)$") {
            return $matches[1].Trim()
        }
    }

    return $null
}

function Read-ErrorBody {
    param([Parameter(Mandatory = $true)]$Exception)

    if (-not $Exception.Response) {
        return ""
    }

    try {
        $stream = $Exception.Response.GetResponseStream()
        if (-not $stream) {
            return ""
        }
        $reader = New-Object System.IO.StreamReader($stream)
        return $reader.ReadToEnd()
    } catch {
        return ""
    }
}

function Invoke-MidtransPreflight {
    param(
        [Parameter(Mandatory = $true)][string]$BaseUrl,
        [Parameter(Mandatory = $true)][string]$ServerKey,
        [Parameter(Mandatory = $true)][string]$MerchantId,
        [Parameter(Mandatory = $true)][string]$ArtifactPath
    )

    $orderId = "PRECHECK-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())-$([Guid]::NewGuid().ToString('N').Substring(0,8))"
    $payload = @{
        transaction_details = @{
            order_id = $orderId
            gross_amount = 1000
        }
        item_details = @(
            @{
                id = $orderId
                price = 1000
                quantity = 1
                name = "Xamina Midtrans Preflight"
            }
        )
        custom_field1 = $MerchantId
    } | ConvertTo-Json -Depth 6

    $basicAuth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$ServerKey`:"))
    $headers = @{
        Authorization = "Basic $basicAuth"
        "Content-Type" = "application/json"
    }

    try {
        $response = Invoke-WebRequest -Method POST -Uri $BaseUrl -Headers $headers -Body $payload -TimeoutSec 45 -UseBasicParsing
        @(
            "STATUS=$($response.StatusCode)"
            $response.Content
        ) -join [Environment]::NewLine | Set-Content $ArtifactPath

        if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
            throw "Midtrans preflight returned non-success status $($response.StatusCode)."
        }

        $body = $response.Content | ConvertFrom-Json
        if (-not $body.redirect_url) {
            throw "Midtrans preflight response missing redirect_url."
        }
    } catch {
        $statusCode = $null
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }
        $errorBody = Read-ErrorBody -Exception $_.Exception
        @(
            "STATUS=$statusCode"
            $errorBody
        ) -join [Environment]::NewLine | Set-Content $ArtifactPath

        if ($statusCode) {
            throw "Midtrans preflight failed (status $statusCode). Check $ArtifactPath for details."
        }
        throw "Midtrans preflight failed. Check $ArtifactPath for details."
    }
}

function Invoke-ApiJson {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Uri,
        [hashtable]$Headers = @{},
        $Body = $null
    )

    $args = @{
        Method = $Method
        Uri = $Uri
        TimeoutSec = 45
        ErrorAction = "Stop"
    }
    if ($Headers.Count -gt 0) {
        $args.Headers = $Headers
    }
    if ($null -ne $Body) {
        $args.ContentType = "application/json"
        $args.Body = ($Body | ConvertTo-Json -Depth 10)
    }
    Invoke-RestMethod @args
}

function Assert-SuccessResponse {
    param(
        [Parameter(Mandatory = $true)]$Response,
        [Parameter(Mandatory = $true)][string]$StepName
    )

    if (-not $Response.success) {
        throw "$StepName failed: success=false"
    }
}

function Wait-ForHttpOk {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [int]$Attempts = 90
    )

    for ($i = 0; $i -lt $Attempts; $i += 1) {
        try {
            $resp = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 5
            if ($resp.StatusCode -eq 200) {
                return
            }
        } catch {
        }
        Start-Sleep -Seconds 2
    }

    throw "Health check failed for $Uri"
}

function Invoke-DbExec {
    param(
        [Parameter(Mandatory = $true)][string]$Sql
    )

    $args = @(
        "-f", $composeFile,
        "--profile", "test",
        "exec", "-T", "postgres-test",
        "psql", "-U", "postgres", "-d", "xamina_test",
        "-v", "ON_ERROR_STOP=1",
        "-c", $Sql
    )
    $result = & docker compose @args
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to execute SQL command through docker compose"
    }
    ($result | Out-String).Trim()
}

function Invoke-DbJson {
    param(
        [Parameter(Mandatory = $true)][string]$Sql
    )

    $args = @(
        "-f", $composeFile,
        "--profile", "test",
        "exec", "-T", "postgres-test",
        "psql", "-U", "postgres", "-d", "xamina_test",
        "-t", "-A",
        "-v", "ON_ERROR_STOP=1",
        "-c", $Sql
    )
    $result = & docker compose @args
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to query SQL through docker compose"
    }
    ($result | Out-String).Trim()
}

function Invoke-MigrationFile {
    param(
        [Parameter(Mandatory = $true)][string]$MigrationPath
    )

    $content = [System.IO.File]::ReadAllText($MigrationPath)
    $args = @(
        "-f", $composeFile,
        "--profile", "test",
        "exec", "-T", "postgres-test",
        "psql", "-U", "postgres", "-d", "xamina_test",
        "-v", "ON_ERROR_STOP=1",
        "-f", "-"
    )
    $content | & docker compose @args | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to apply migration $MigrationPath"
    }
}

function Wait-ForDatabase {
    param([int]$Attempts = 60)

    for ($i = 0; $i -lt $Attempts; $i += 1) {
        $args = @(
            "-f", $composeFile,
            "--profile", "test",
            "exec", "-T", "postgres-test",
            "psql", "-U", "postgres", "-d", "xamina_test",
            "-t", "-A",
            "-c", "SELECT 1;"
        )
        $result = $null
        $exitCode = $null
        try {
            $result = & docker compose @args 2>$null
            $exitCode = $LASTEXITCODE
        } catch {
            # Treat transient postgres startup errors as "not ready" and retry.
            $exitCode = $LASTEXITCODE
        }
        if ($exitCode -eq 0 -and (($result | Out-String).Trim() -eq "1")) {
            return
        }
        Start-Sleep -Seconds 2
    }

    throw "postgres-test did not become ready in time."
}

function Reset-TestDatabase {
    Invoke-DbExec -Sql "DROP SCHEMA IF EXISTS app CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;"
}

function Apply-Migrations {
    $migrationFiles = @(
        "xamina-backend\crates\db\migrations\0001_extensions.sql",
        "xamina-backend\crates\db\migrations\0002_core_auth.sql",
        "xamina-backend\crates\db\migrations\0003_questions.sql",
        "xamina-backend\crates\db\migrations\0004_exams.sql",
        "xamina-backend\crates\db\migrations\0005_submissions.sql",
        "xamina-backend\crates\db\migrations\0006_publish_conflict_indexes.sql",
        "xamina-backend\crates\db\migrations\0007_notifications.sql",
        "xamina-backend\crates\db\migrations\0008_dashboard_indexes.sql",
        "xamina-backend\crates\db\migrations\0009_sprint7_multitenant_rls.sql",
        "xamina-backend\crates\db\migrations\0010_ai_usage_logs.sql",
        "xamina-backend\crates\db\migrations\0011_sprint10_certificates_delivery.sql",
        "xamina-backend\crates\db\migrations\0012_sprint10_push_receipts.sql",
        "xamina-backend\crates\db\migrations\0013_sprint11_analytics_indexes.sql",
        "xamina-backend\crates\db\migrations\20260225105400_schema_app_and_superadmin_seed.sql",
        "xamina-backend\crates\db\migrations\0014_sprint13_billing.sql",
        "xamina-backend\crates\db\migrations\0015_sprint14_platform_ops.sql"
    )

    foreach ($relativePath in $migrationFiles) {
        Invoke-MigrationFile -MigrationPath (Join-Path $repoRoot $relativePath)
    }
}

function Get-Sha512Hex {
    param([Parameter(Mandatory = $true)][string]$Text)

    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $sha = [System.Security.Cryptography.SHA512]::Create()
    try {
        $hash = $sha.ComputeHash($bytes)
    } finally {
        $sha.Dispose()
    }
    ([System.BitConverter]::ToString($hash).Replace("-", "")).ToLowerInvariant()
}

$envFile = Join-Path $backendDir ".env"
$midtransServerKey = Get-EnvValueFromFile -FilePath $envFile -Key "MIDTRANS_SERVER_KEY"
$midtransClientKey = Get-EnvValueFromFile -FilePath $envFile -Key "MIDTRANS_CLIENT_KEY"
$midtransMerchantId = Get-EnvValueFromFile -FilePath $envFile -Key "MIDTRANS_MERCHANT_ID"
$midtransBaseUrl = Get-EnvValueFromFile -FilePath $envFile -Key "MIDTRANS_BASE_URL"

if ([string]::IsNullOrWhiteSpace($midtransServerKey) -or [string]::IsNullOrWhiteSpace($midtransClientKey) -or [string]::IsNullOrWhiteSpace($midtransMerchantId)) {
    throw "MIDTRANS_SERVER_KEY, MIDTRANS_CLIENT_KEY, and MIDTRANS_MERCHANT_ID must be present in xamina-backend/.env."
}
if ([string]::IsNullOrWhiteSpace($midtransBaseUrl)) {
    $midtransBaseUrl = "https://app.sandbox.midtrans.com/snap/v1/transactions"
}

$apiProcess = $null
$previousEnv = @{}
$overrides = @{
    DATABASE_URL = $TestDatabaseUrl
    REDIS_URL = $RedisUrl
    API_HOST = "127.0.0.1"
    API_PORT = ([uri]$ApiBaseUrl).Port.ToString()
    BILLING_PROVIDER = "midtrans"
    MIDTRANS_SERVER_KEY = $midtransServerKey
    MIDTRANS_CLIENT_KEY = $midtransClientKey
    MIDTRANS_MERCHANT_ID = $midtransMerchantId
    MIDTRANS_BASE_URL = $midtransBaseUrl
    INVOICE_PUBLIC_BASE_URL = ((($ApiBaseUrl -replace "/api/v1$", "").TrimEnd("/")) + "/uploads/invoices")
}

try {
    Invoke-MidtransPreflight -BaseUrl $midtransBaseUrl -ServerKey $midtransServerKey -MerchantId $midtransMerchantId -ArtifactPath $midtransPreflightPath

    & docker compose -f $composeFile --profile test up -d postgres-test redis | Out-Null

    Wait-ForDatabase
    Reset-TestDatabase
    Apply-Migrations

    foreach ($key in $overrides.Keys) {
        $previousEnv[$key] = [Environment]::GetEnvironmentVariable($key)
        [Environment]::SetEnvironmentVariable($key, $overrides[$key])
    }

    $apiProcess = Start-Process `
        -FilePath "cargo" `
        -ArgumentList @("run", "-p", "api") `
        -WorkingDirectory $backendDir `
        -NoNewWindow `
        -PassThru `
        -RedirectStandardOutput $apiStdoutPath `
        -RedirectStandardError $apiStderrPath

    $healthUrl = (($ApiBaseUrl -replace "/api/v1$", "").TrimEnd("/")) + "/health"
    Wait-ForHttpOk -Uri $healthUrl

    $plans = Invoke-ApiJson -Method GET -Uri "$ApiBaseUrl/billing/plans"
    Assert-SuccessResponse -Response $plans -StepName "load billing plans"

    $adminLogin = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/auth/login" -Body @{
        email = $AdminEmail
        password = $AdminPassword
        tenant_slug = $TenantSlug
    }
    Assert-SuccessResponse -Response $adminLogin -StepName "admin login"
    $adminToken = $adminLogin.data.access_token
    $adminHeaders = @{ Authorization = "Bearer $adminToken" }

    $summaryBefore = Invoke-ApiJson -Method GET -Uri "$ApiBaseUrl/billing/summary" -Headers $adminHeaders
    Assert-SuccessResponse -Response $summaryBefore -StepName "billing summary before checkout"

    $checkout = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/billing/checkout" -Headers $adminHeaders -Body @{
        plan_code = "starter"
    }
    Assert-SuccessResponse -Response $checkout -StepName "create midtrans checkout"

    $invoiceId = $checkout.data.invoice.id
    $providerRef = $checkout.data.invoice.provider_ref
    $grossAmount = [string]$checkout.data.invoice.amount
    $signature = Get-Sha512Hex -Text ("{0}{1}{2}{3}" -f $providerRef, "200", $grossAmount, $midtransServerKey)

    $webhook = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/billing/midtrans/webhook" -Body @{
        order_id = $providerRef
        status_code = "200"
        gross_amount = $grossAmount
        transaction_status = "settlement"
        fraud_status = "accept"
        signature_key = $signature
    }
    Assert-SuccessResponse -Response $webhook -StepName "process settlement webhook"

    Invoke-WebRequest `
        -Uri "$ApiBaseUrl/billing/invoices/$invoiceId/pdf" `
        -Headers $adminHeaders `
        -OutFile $pdfPath `
        -UseBasicParsing `
        -TimeoutSec 45 | Out-Null

    $summaryAfter = Invoke-ApiJson -Method GET -Uri "$ApiBaseUrl/billing/summary" -Headers $adminHeaders
    Assert-SuccessResponse -Response $summaryAfter -StepName "billing summary after webhook"

    if ([string]::IsNullOrWhiteSpace($checkout.data.checkout_url) -or -not $checkout.data.checkout_url.Contains("midtrans")) {
        throw "Midtrans redirect_url was not returned by checkout flow."
    }
    if ($webhook.data.subscription.status -ne "active") {
        throw "Webhook did not activate subscription."
    }
    if ((Get-Item $pdfPath).Length -le 200) {
        throw "Downloaded invoice PDF is unexpectedly small."
    }

    $dbSnapshot = [ordered]@{
        billing_subscriptions = (Invoke-DbJson -Sql "SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text FROM (SELECT id, tenant_id, plan_code, status, provider, latest_invoice_id, amount, currency, period_start, period_end, created_at, updated_at FROM billing_subscriptions ORDER BY created_at DESC LIMIT 5) t;" | ConvertFrom-Json)
        billing_invoices = (Invoke-DbJson -Sql "SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text FROM (SELECT id, tenant_id, subscription_id, plan_code, status, provider, provider_ref, amount, currency, due_at, paid_at, attempt_count, checkout_url, pdf_url, created_at, updated_at FROM billing_invoices ORDER BY created_at DESC LIMIT 5) t;" | ConvertFrom-Json)
        billing_webhook_events = (Invoke-DbJson -Sql "SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text FROM (SELECT id, tenant_id, provider, event_key, provider_ref, raw_payload_jsonb, processed_at, created_at FROM billing_webhook_events ORDER BY created_at DESC LIMIT 5) t;" | ConvertFrom-Json)
    }

    $summary = [ordered]@{
        generated_at = (Get-Date).ToUniversalTime().ToString("o")
        api_base_url = $ApiBaseUrl
        tenant_slug = $TenantSlug
        billing_provider = "midtrans"
        midtrans = [ordered]@{
            merchant_id_present = (-not [string]::IsNullOrWhiteSpace($midtransMerchantId))
            client_key_present = (-not [string]::IsNullOrWhiteSpace($midtransClientKey))
            preflight_artifact = [IO.Path]::GetFileName($midtransPreflightPath)
            redirect_url = $checkout.data.checkout_url
        }
        login = [ordered]@{
            admin_email = $AdminEmail
            tenant_id = $adminLogin.data.user.tenant_id
        }
        checkout = [ordered]@{
            invoice_id = $invoiceId
            provider_ref = $providerRef
            amount = $checkout.data.invoice.amount
            gateway_mode = $checkout.data.gateway_mode
            checkout_url = $checkout.data.checkout_url
        }
        webhook = [ordered]@{
            already_processed = $webhook.data.already_processed
            invoice_status = $webhook.data.invoice.status
            subscription_status = $webhook.data.subscription.status
        }
        summary_before = $summaryBefore.data
        summary_after = $summaryAfter.data
        invoice_pdf = [ordered]@{
            artifact = [IO.Path]::GetFileName($pdfPath)
            bytes = (Get-Item $pdfPath).Length
        }
        db_snapshot = $dbSnapshot
        artifacts = [ordered]@{
            summary = [IO.Path]::GetFileName($summaryPath)
            api_stdout = [IO.Path]::GetFileName($apiStdoutPath)
            api_stderr = [IO.Path]::GetFileName($apiStderrPath)
            midtrans_preflight = [IO.Path]::GetFileName($midtransPreflightPath)
            invoice_pdf = [IO.Path]::GetFileName($pdfPath)
        }
    }

    $summary | ConvertTo-Json -Depth 10 | Set-Content $summaryPath
    Get-Content $summaryPath
} catch {
    $failureSummary = [ordered]@{
        generated_at = (Get-Date).ToUniversalTime().ToString("o")
        api_base_url = $ApiBaseUrl
        tenant_slug = $TenantSlug
        billing_provider = "midtrans"
        runtime_status = "failed"
        error = $_.Exception.Message
        artifacts = [ordered]@{
            summary = [IO.Path]::GetFileName($summaryPath)
            api_stdout = [IO.Path]::GetFileName($apiStdoutPath)
            api_stderr = [IO.Path]::GetFileName($apiStderrPath)
            midtrans_preflight = if (Test-Path $midtransPreflightPath) { [IO.Path]::GetFileName($midtransPreflightPath) } else { $null }
            invoice_pdf = if (Test-Path $pdfPath) { [IO.Path]::GetFileName($pdfPath) } else { $null }
        }
    }
    $failureSummary | ConvertTo-Json -Depth 6 | Set-Content $summaryPath
    throw
} finally {
    if ($apiProcess -and -not $apiProcess.HasExited) {
        Stop-Process -Id $apiProcess.Id -Force
    }
    foreach ($key in $overrides.Keys) {
        [Environment]::SetEnvironmentVariable($key, $previousEnv[$key])
    }
}
