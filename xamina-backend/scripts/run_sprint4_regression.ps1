$ErrorActionPreference = "Stop"

$apiBaseUrl = if ($env:API_BASE_URL) { $env:API_BASE_URL } else { "http://localhost:8080/api/v1" }
$tenantSlug = if ($env:TENANT_SLUG) { $env:TENANT_SLUG } else { "default" }
$adminEmail = if ($env:ADMIN_EMAIL) { $env:ADMIN_EMAIL } else { "admin@xamina.local" }
$adminPassword = if ($env:ADMIN_PASSWORD) { $env:ADMIN_PASSWORD } else { "Admin123!" }

Write-Host "Running Sprint 4 regression against: $apiBaseUrl"

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

    $status = $null
    $content = ""

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

        $status = [int] $response.StatusCode
        $content = $response.Content
    } catch {
        if (-not $_.Exception.Response) {
            throw
        }
        $errorResponse = $_.Exception.Response
        $status = [int] $errorResponse.StatusCode
        $stream = $errorResponse.GetResponseStream()
        if ($stream) {
            $reader = New-Object System.IO.StreamReader($stream)
            $content = $reader.ReadToEnd()
            $reader.Dispose()
            $stream.Dispose()
        }
        if ([string]::IsNullOrWhiteSpace($content) -and $_.ErrorDetails -and $_.ErrorDetails.Message) {
            $content = $_.ErrorDetails.Message
        }
    }

    $json = $null
    if (-not [string]::IsNullOrWhiteSpace($content)) {
        try {
            $json = $content | ConvertFrom-Json
        } catch {
            $json = $null
        }
    }

    return @{
        status = $status
        body = $json
    }
}

function Assert-True {
    param(
        [Parameter(Mandatory = $true)] [bool] $Condition,
        [Parameter(Mandatory = $true)] [string] $Message
    )
    if (-not $Condition) {
        throw "Assertion failed: $Message"
    }
}

function Assert-Status {
    param(
        [Parameter(Mandatory = $true)] $Response,
        [Parameter(Mandatory = $true)] [int] $Expected,
        [Parameter(Mandatory = $true)] [string] $Step
    )
    if ($Response.status -ne $Expected) {
        throw "$Step failed: expected status $Expected, got $($Response.status)"
    }
}

Write-Host "[1/9] Login admin..."
$login = Invoke-ApiJson -Method "POST" -Uri "$apiBaseUrl/auth/login" -Body @{
    email = $adminEmail
    password = $adminPassword
    tenant_slug = $tenantSlug
}
Assert-Status -Response $login -Expected 200 -Step "Login"
Assert-True -Condition ($login.body.success -eq $true) -Message "Login success flag"
$accessToken = $login.body.data.access_token
Assert-True -Condition (-not [string]::IsNullOrWhiteSpace($accessToken)) -Message "Access token exists"
$headers = @{ Authorization = "Bearer $accessToken" }

$baseStart = [DateTime]::UtcNow.AddDays(2).Date.AddHours(8)
$baseEnd = $baseStart.AddHours(1)
$startIso = $baseStart.ToString("yyyy-MM-ddTHH:mm:ssZ")
$endIso = $baseEnd.ToString("yyyy-MM-ddTHH:mm:ssZ")

Write-Host "[2/9] Create exam with valid schedule..."
$validExam = Invoke-ApiJson -Method "POST" -Uri "$apiBaseUrl/exams" -Headers $headers -Body @{
    title = "Regression Valid Exam $(Get-Date -Format 'yyyyMMdd-HHmmss')"
    duration_minutes = 60
    pass_score = 70
    start_at = $startIso
    end_at = $endIso
}
Assert-Status -Response $validExam -Expected 200 -Step "Create valid exam"
$validExamId = $validExam.body.data.id
Assert-True -Condition (-not [string]::IsNullOrWhiteSpace($validExamId)) -Message "Valid exam id exists"

Write-Host "[3/9] Create exam with invalid schedule (start >= end)..."
$invalidExam = Invoke-ApiJson -Method "POST" -Uri "$apiBaseUrl/exams" -Headers $headers -Body @{
    title = "Regression Invalid Schedule"
    duration_minutes = 60
    start_at = $startIso
    end_at = $startIso
}
Assert-Status -Response $invalidExam -Expected 400 -Step "Create invalid schedule exam"
Assert-True -Condition ($invalidExam.body.error.code -eq "VALIDATION_ERROR") -Message "Invalid schedule should return VALIDATION_ERROR"

Write-Host "[4/9] Create exam without schedule and run publish precheck..."
$noScheduleExam = Invoke-ApiJson -Method "POST" -Uri "$apiBaseUrl/exams" -Headers $headers -Body @{
    title = "Regression No Schedule $(Get-Date -Format 'yyyyMMdd-HHmmss')"
    duration_minutes = 45
}
Assert-Status -Response $noScheduleExam -Expected 200 -Step "Create no-schedule exam"
$noScheduleExamId = $noScheduleExam.body.data.id
$precheckNoSchedule = Invoke-ApiJson -Method "GET" -Uri "$apiBaseUrl/exams/$noScheduleExamId/publish-precheck" -Headers $headers
Assert-Status -Response $precheckNoSchedule -Expected 200 -Step "Precheck no-schedule exam"
$hasScheduleRequired = $false
foreach ($issue in $precheckNoSchedule.body.data.issues) {
    if ($issue.code -eq "SCHEDULE_REQUIRED") {
        $hasScheduleRequired = $true
        break
    }
}
Assert-True -Condition $hasScheduleRequired -Message "Precheck must include SCHEDULE_REQUIRED"

Write-Host "[5/9] Create question for publish/detach checks..."
$question = Invoke-ApiJson -Method "POST" -Uri "$apiBaseUrl/questions" -Headers $headers -Body @{
    type = "multiple_choice"
    content = "Regression question $(Get-Date -Format 'yyyyMMdd-HHmmss')"
    options_jsonb = @(
        @{ id = "A"; label = "Option A" },
        @{ id = "B"; label = "Option B" }
    )
    answer_key = "B"
    topic = "Regression"
    difficulty = "easy"
}
Assert-Status -Response $question -Expected 200 -Step "Create question"
$questionId = $question.body.data.id
Assert-True -Condition (-not [string]::IsNullOrWhiteSpace($questionId)) -Message "Question id exists"

Write-Host "[6/9] Publish should fail when schedule missing..."
$attachNoSchedule = Invoke-ApiJson -Method "POST" -Uri "$apiBaseUrl/exams/$noScheduleExamId/questions" -Headers $headers -Body @{
    question_ids = @($questionId)
}
Assert-Status -Response $attachNoSchedule -Expected 200 -Step "Attach on no-schedule exam"
$publishNoSchedule = Invoke-ApiJson -Method "POST" -Uri "$apiBaseUrl/exams/$noScheduleExamId/publish" -Headers $headers -Body @{}
Assert-Status -Response $publishNoSchedule -Expected 400 -Step "Publish no-schedule exam"
Assert-True -Condition ($publishNoSchedule.body.error.code -eq "PUBLISH_FAILED") -Message "Publish no-schedule should return PUBLISH_FAILED"

Write-Host "[7/9] Publish valid exam and verify detach blocked on published..."
$attachValid = Invoke-ApiJson -Method "POST" -Uri "$apiBaseUrl/exams/$validExamId/questions" -Headers $headers -Body @{
    question_ids = @($questionId)
}
Assert-Status -Response $attachValid -Expected 200 -Step "Attach on valid exam"
$precheckValid = Invoke-ApiJson -Method "GET" -Uri "$apiBaseUrl/exams/$validExamId/publish-precheck" -Headers $headers
Assert-Status -Response $precheckValid -Expected 200 -Step "Precheck valid exam"
Assert-True -Condition ($precheckValid.body.data.publishable -eq $true) -Message "Valid exam should be publishable"
$publishValid = Invoke-ApiJson -Method "POST" -Uri "$apiBaseUrl/exams/$validExamId/publish" -Headers $headers -Body @{}
Assert-Status -Response $publishValid -Expected 200 -Step "Publish valid exam"
$detachPublished = Invoke-ApiJson -Method "DELETE" -Uri "$apiBaseUrl/exams/$validExamId/questions/$questionId" -Headers $headers
Assert-Status -Response $detachPublished -Expected 400 -Step "Detach on published exam"
Assert-True -Condition ($detachPublished.body.error.code -eq "ATTACH_FAILED") -Message "Detach on published should return ATTACH_FAILED"

Write-Host "[8/9] Detach should fail when question not attached on draft exam..."
$draftExam = Invoke-ApiJson -Method "POST" -Uri "$apiBaseUrl/exams" -Headers $headers -Body @{
    title = "Regression Draft Detach $(Get-Date -Format 'yyyyMMdd-HHmmss')"
    duration_minutes = 50
    start_at = $startIso
    end_at = $endIso
}
Assert-Status -Response $draftExam -Expected 200 -Step "Create draft exam for detach check"
$draftExamId = $draftExam.body.data.id
$detachNotAttached = Invoke-ApiJson -Method "DELETE" -Uri "$apiBaseUrl/exams/$draftExamId/questions/$questionId" -Headers $headers
Assert-Status -Response $detachNotAttached -Expected 400 -Step "Detach non-attached question"
Assert-True -Condition ($detachNotAttached.body.error.code -eq "VALIDATION_ERROR") -Message "Detach non-attached should return VALIDATION_ERROR"

Write-Host "[9/9] Unpublish published exam and verify draft state..."
$unpublish = Invoke-ApiJson -Method "POST" -Uri "$apiBaseUrl/exams/$validExamId/unpublish" -Headers $headers -Body @{}
Assert-Status -Response $unpublish -Expected 200 -Step "Unpublish exam"
Assert-True -Condition ($unpublish.body.data.status -eq "draft") -Message "Unpublish should set status draft"

Write-Host "Sprint 4 regression checks passed."
