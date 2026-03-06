$ErrorActionPreference = "Stop"

$apiBaseUrl = if ($env:API_BASE_URL) { $env:API_BASE_URL } else { "http://localhost:8080/api/v1" }
$tenantSlug = if ($env:TENANT_SLUG) { $env:TENANT_SLUG } else { "default" }
$adminEmail = if ($env:ADMIN_EMAIL) { $env:ADMIN_EMAIL } else { "admin@xamina.local" }
$adminPassword = if ($env:ADMIN_PASSWORD) { $env:ADMIN_PASSWORD } else { "Admin123!" }

Write-Host "Running MVP smoke flow against: $apiBaseUrl"

function Assert-SuccessResponse {
    param(
        [Parameter(Mandatory = $true)] $Response,
        [Parameter(Mandatory = $true)] [string] $StepName
    )

    if (-not $Response.success) {
        throw "$StepName failed: response.success is false."
    }
}

Write-Host "[1/7] Login admin..."
$loginBody = @{
    email = $adminEmail
    password = $adminPassword
    tenant_slug = $tenantSlug
} | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/auth/login" -ContentType "application/json" -Body $loginBody
Assert-SuccessResponse -Response $login -StepName "Login"
$accessToken = $login.data.access_token
if (-not $accessToken) { throw "Login failed: no access_token returned." }

$headers = @{ Authorization = "Bearer $accessToken" }

Write-Host "[2/7] Create question..."
$questionBody = @{
    type = "multiple_choice"
    content = "2 + 3 = ?"
    options_jsonb = @(
        @{ id = "A"; label = "4" },
        @{ id = "B"; label = "5" }
    )
    answer_key = "B"
    topic = "Math"
    difficulty = "easy"
} | ConvertTo-Json -Depth 6
$question = Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/questions" -Headers $headers -ContentType "application/json" -Body $questionBody
Assert-SuccessResponse -Response $question -StepName "Create question"
$questionId = $question.data.id
if (-not $questionId) { throw "Create question failed: no question id returned." }

Write-Host "[3/7] Create exam..."
$dayOffset = [int](([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) % 10000)
$startAtDate = [DateTime]::UtcNow.Date.AddDays($dayOffset).AddHours(8)
$endAtDate = $startAtDate.AddHours(1)
$startAt = $startAtDate.ToString("yyyy-MM-ddTHH:mm:ssZ")
$endAt = $endAtDate.ToString("yyyy-MM-ddTHH:mm:ssZ")
$examBody = @{
    title = "Smoke Exam $(Get-Date -Format 'yyyyMMdd-HHmmss')"
    description = "Automated smoke test exam"
    duration_minutes = 60
    pass_score = 70
    shuffle_questions = $false
    shuffle_options = $false
    start_at = $startAt
    end_at = $endAt
} | ConvertTo-Json
$exam = Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/exams" -Headers $headers -ContentType "application/json" -Body $examBody
Assert-SuccessResponse -Response $exam -StepName "Create exam"
$examId = $exam.data.id
if (-not $examId) { throw "Create exam failed: no exam id returned." }

Write-Host "[4/7] Attach question to exam..."
$attachBody = @{ question_ids = @($questionId) } | ConvertTo-Json
$attach = Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/exams/$examId/questions" -Headers $headers -ContentType "application/json" -Body $attachBody
Assert-SuccessResponse -Response $attach -StepName "Attach question"

Write-Host "[5/7] Run publish precheck..."
$precheck = Invoke-RestMethod -Method Get -Uri "$apiBaseUrl/exams/$examId/publish-precheck" -Headers $headers
Assert-SuccessResponse -Response $precheck -StepName "Publish precheck"
if (-not $precheck.data.publishable) {
    $issues = ($precheck.data.issues | ForEach-Object { "$($_.code): $($_.message)" }) -join "; "
    throw "Precheck indicates exam is not publishable. Issues: $issues"
}

Write-Host "[6/7] Publish exam..."
$publish = Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/exams/$examId/publish" -Headers $headers -ContentType "application/json" -Body "{}"
Assert-SuccessResponse -Response $publish -StepName "Publish exam"
if ($publish.data.status -ne "published") {
    throw "Publish exam failed: status is not published."
}

Write-Host "[7/7] Verify exam detail status..."
$detail = Invoke-RestMethod -Method Get -Uri "$apiBaseUrl/exams/$examId" -Headers $headers
Assert-SuccessResponse -Response $detail -StepName "Get exam detail"
if ($detail.data.exam.status -ne "published") {
    throw "Exam detail status mismatch. Expected published."
}

Write-Host "MVP smoke flow passed."
