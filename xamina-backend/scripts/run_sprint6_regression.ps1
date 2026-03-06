$ErrorActionPreference = "Stop"

$apiBaseUrl = if ($env:API_BASE_URL) { $env:API_BASE_URL } else { "http://localhost:8080/api/v1" }
$apiRootUrl = if ($env:API_ROOT_URL) { $env:API_ROOT_URL } else { "http://localhost:8080" }
$tenantSlug = if ($env:TENANT_SLUG) { $env:TENANT_SLUG } else { "default" }
$adminEmail = if ($env:ADMIN_EMAIL) { $env:ADMIN_EMAIL } else { "admin@xamina.local" }
$adminPassword = if ($env:ADMIN_PASSWORD) { $env:ADMIN_PASSWORD } else { "Admin123!" }

function Invoke-ApiJson {
    param(
        [Parameter(Mandatory = $true)] [string] $Method,
        [Parameter(Mandatory = $true)] [string] $Uri,
        [hashtable] $Headers,
        [object] $Body
    )

    $payload = $null
    if ($null -ne $Body) {
        $payload = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Depth 10 }
    }

    try {
        $requestParams = @{
            Method = $Method
            Uri = $Uri
            Headers = $Headers
            ContentType = "application/json"
            UseBasicParsing = $true
        }
        if ($null -ne $payload) {
            $requestParams.Body = $payload
        }
        $response = Invoke-WebRequest @requestParams
        return @{
            status = [int]$response.StatusCode
            body = if ($response.Content) { $response.Content | ConvertFrom-Json } else { $null }
            raw = $response
        }
    } catch {
        if (-not $_.Exception.Response) {
            throw
        }
        $errorResponse = $_.Exception.Response
        $stream = $errorResponse.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $content = $reader.ReadToEnd()
        $reader.Dispose()
        $stream.Dispose()
        return @{
            status = [int]$errorResponse.StatusCode
            body = if ($content) { $content | ConvertFrom-Json } else { $null }
            raw = $null
        }
    }
}

function Assert-Status($resp, [int]$expected, [string]$label) {
    if ($resp.status -ne $expected) {
        throw "$label expected HTTP $expected, got $($resp.status)"
    }
}

Write-Host "[1/10] Login admin..."
$login = Invoke-ApiJson -Method "POST" -Uri "$apiBaseUrl/auth/login" -Body @{
    email = $adminEmail
    password = $adminPassword
    tenant_slug = $tenantSlug
}
Assert-Status $login 200 "login"
$token = $login.body.data.access_token
$headers = @{ Authorization = "Bearer $token" }

Write-Host "[2/10] Dashboard summary endpoint..."
$dashboard = Invoke-ApiJson -Method "GET" -Uri "$apiBaseUrl/dashboard/summary" -Headers $headers
Assert-Status $dashboard 200 "dashboard summary"

Write-Host "[3/10] Report endpoint..."
$report = Invoke-ApiJson -Method "GET" -Uri "$apiBaseUrl/reports/class-results?page=1&page_size=5" -Headers $headers
Assert-Status $report 200 "class results report"

Write-Host "[4/10] CSV export endpoint..."
$csv = Invoke-WebRequest -Method GET -Uri "$apiBaseUrl/reports/class-results/export.csv?page=1&page_size=5" -Headers $headers -UseBasicParsing
if ($csv.StatusCode -ne 200) {
    throw "CSV export failed with status $($csv.StatusCode)"
}
if (-not $csv.Content.Contains("class_id,class_name,grade,major,exam_id,exam_title")) {
    throw "CSV export header mismatch"
}

Write-Host "[5/10] Notifications list..."
$notifications = Invoke-ApiJson -Method "GET" -Uri "$apiBaseUrl/notifications" -Headers $headers
Assert-Status $notifications 200 "notifications list"

Write-Host "[6/10] Notifications read-all..."
$readAll = Invoke-ApiJson -Method "POST" -Uri "$apiBaseUrl/notifications/read-all" -Headers $headers -Body @{}
Assert-Status $readAll 200 "notifications read-all"

Write-Host "[7/10] Notifications unread-only..."
$unread = Invoke-ApiJson -Method "GET" -Uri "$apiBaseUrl/notifications?unread_only=true" -Headers $headers
Assert-Status $unread 200 "notifications unread-only"

Write-Host "[8/10] Metrics endpoint..."
$metrics = Invoke-WebRequest -Method GET -Uri "$apiRootUrl/metrics" -UseBasicParsing
if ($metrics.StatusCode -ne 200) {
    throw "Metrics endpoint failed with status $($metrics.StatusCode)"
}
if (-not $metrics.Content.Contains("http") -and -not $metrics.Content.Contains("axum")) {
    throw "Metrics payload is empty or unexpected"
}

Write-Host "[9/10] Frontend checklist marker..."
Write-Host "Manual checklist required: dashboard bar chart rendered + PWA install prompt flow validated."

Write-Host "[10/10] Sprint 6 API regression complete."
