$ErrorActionPreference = "Stop"

$apiBaseUrl = if ($env:API_BASE_URL) { $env:API_BASE_URL } else { "http://localhost:8080/api/v1" }
$tenantSlug = if ($env:TENANT_SLUG) { $env:TENANT_SLUG } else { "default" }
$adminEmail = if ($env:ADMIN_EMAIL) { $env:ADMIN_EMAIL } else { "admin@xamina.local" }
$adminPassword = if ($env:ADMIN_PASSWORD) { $env:ADMIN_PASSWORD } else { "Admin123!" }

Write-Host "Running student session smoke against: $apiBaseUrl"

function Assert-SuccessResponse {
    param(
        [Parameter(Mandatory = $true)] $Response,
        [Parameter(Mandatory = $true)] [string] $StepName
    )

    if (-not $Response.success) {
        throw "$StepName failed: response.success is false."
    }
}

Write-Host "[1/10] Login admin..."
$loginBody = @{
    email = $adminEmail
    password = $adminPassword
    tenant_slug = $tenantSlug
} | ConvertTo-Json
$adminLogin = Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/auth/login" -ContentType "application/json" -Body $loginBody
Assert-SuccessResponse -Response $adminLogin -StepName "Admin login"
$adminHeaders = @{ Authorization = "Bearer $($adminLogin.data.access_token)" }

$suffix = Get-Date -Format "yyyyMMddHHmmss"
$studentEmail = "student-smoke-$suffix@xamina.local"
$studentPassword = "Student123!"

Write-Host "[2/10] Create smoke student user..."
$createUserBody = @{
    email = $studentEmail
    name = "Smoke Student $suffix"
    role = "siswa"
    password = $studentPassword
} | ConvertTo-Json
$studentUser = Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/users" -Headers $adminHeaders -ContentType "application/json" -Body $createUserBody
Assert-SuccessResponse -Response $studentUser -StepName "Create student"

Write-Host "[3/10] Create 3 question types..."
$qMc = Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/questions" -Headers $adminHeaders -ContentType "application/json" -Body (@{
    type = "multiple_choice"
    content = "Smoke MC"
    options_jsonb = @(@{id="A";label="1"}, @{id="B";label="2"})
    answer_key = "B"
    topic = "Smoke"
    difficulty = "easy"
} | ConvertTo-Json -Depth 6)
Assert-SuccessResponse -Response $qMc -StepName "Create MC question"

$qTf = Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/questions" -Headers $adminHeaders -ContentType "application/json" -Body (@{
    type = "true_false"
    content = "Smoke TF"
    options_jsonb = @(@{value=$true}, @{value=$false})
    answer_key = $true
    topic = "Smoke"
    difficulty = "easy"
} | ConvertTo-Json -Depth 6)
Assert-SuccessResponse -Response $qTf -StepName "Create TF question"

$qSa = Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/questions" -Headers $adminHeaders -ContentType "application/json" -Body (@{
    type = "short_answer"
    content = "Smoke SA"
    options_jsonb = @()
    answer_key = "jakarta"
    topic = "Smoke"
    difficulty = "easy"
} | ConvertTo-Json -Depth 6)
Assert-SuccessResponse -Response $qSa -StepName "Create SA question"

Write-Host "[4/10] Create + publish exam..."
$startAt = (Get-Date).ToUniversalTime().AddMinutes(-5).ToString("yyyy-MM-ddTHH:mm:ssZ")
$endAt = (Get-Date).ToUniversalTime().AddHours(1).ToString("yyyy-MM-ddTHH:mm:ssZ")
$exam = Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/exams" -Headers $adminHeaders -ContentType "application/json" -Body (@{
    title = "Smoke Student Session $suffix"
    duration_minutes = 60
    pass_score = 70
    shuffle_questions = $true
    shuffle_options = $true
    start_at = $startAt
    end_at = $endAt
} | ConvertTo-Json)
Assert-SuccessResponse -Response $exam -StepName "Create exam"
$examId = $exam.data.id

$attach = Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/exams/$examId/questions" -Headers $adminHeaders -ContentType "application/json" -Body (@{
    question_ids = @($qMc.data.id, $qTf.data.id, $qSa.data.id)
} | ConvertTo-Json)
Assert-SuccessResponse -Response $attach -StepName "Attach questions"

$publish = Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/exams/$examId/publish" -Headers $adminHeaders -ContentType "application/json" -Body "{}"
Assert-SuccessResponse -Response $publish -StepName "Publish exam"

Write-Host "[5/10] Login smoke student..."
$studentLogin = Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/auth/login" -ContentType "application/json" -Body (@{
    email = $studentEmail
    password = $studentPassword
    tenant_slug = $tenantSlug
} | ConvertTo-Json)
Assert-SuccessResponse -Response $studentLogin -StepName "Student login"
$studentHeaders = @{ Authorization = "Bearer $($studentLogin.data.access_token)" }

Write-Host "[6/10] Start student submission..."
$startSubmission = Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/exams/$examId/start" -Headers $studentHeaders -ContentType "application/json" -Body "{}"
Assert-SuccessResponse -Response $startSubmission -StepName "Start exam session"
$submissionId = $startSubmission.data.submission_id

Write-Host "[7/10] Fetch session + compose answers..."
$session = Invoke-RestMethod -Method Get -Uri "$apiBaseUrl/submissions/$submissionId" -Headers $studentHeaders
Assert-SuccessResponse -Response $session -StepName "Get submission session"

$answerItems = @()
foreach ($q in $session.data.questions) {
    $val = $null
    if ($q.type -eq "multiple_choice") { $val = "B" }
    elseif ($q.type -eq "true_false") { $val = $true }
    elseif ($q.type -eq "short_answer") { $val = "jakarta" }
    $answerItems += @{
        question_id = $q.question_id
        answer = $val
        is_bookmarked = $false
    }
}

Write-Host "[8/10] Save answers..."
$saveAnswers = Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/submissions/$submissionId/answers" -Headers $studentHeaders -ContentType "application/json" -Body (@{
    answers = $answerItems
} | ConvertTo-Json -Depth 8)
Assert-SuccessResponse -Response $saveAnswers -StepName "Save answers"

Write-Host "[9/10] Finish submission..."
$finish = Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/submissions/$submissionId/finish" -Headers $studentHeaders -ContentType "application/json" -Body "{}"
Assert-SuccessResponse -Response $finish -StepName "Finish submission"

Write-Host "[10/10] Verify result..."
$result = Invoke-RestMethod -Method Get -Uri "$apiBaseUrl/submissions/$submissionId/result" -Headers $studentHeaders
Assert-SuccessResponse -Response $result -StepName "Get submission result"
if ($result.data.total_questions -lt 1) {
    throw "Result invalid: total_questions < 1."
}

Write-Host "Student session smoke flow passed."
