param(
    [string]$ApiBaseUrl = "http://127.0.0.1:8080/api/v1",
    [string]$TenantSlug = "default",
    [string]$AdminEmail = "admin@xamina.local",
    [string]$AdminPassword = "Admin123!",
    [string]$MailpitApiBaseUrl = "http://127.0.0.1:8025/api/v1"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$reportDir = Join-Path $repoRoot "ops\load\reports"
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$summaryPath = Join-Path $reportDir "sprint10-runtime-evidence-$timestamp.json"
$certBatchPath = Join-Path $reportDir "sprint10-certificate-batch-$timestamp.json"
$broadcastPath = Join-Path $reportDir "sprint10-delivery-smoke-$timestamp.json"
$dbSnapshotPath = Join-Path $reportDir "sprint10-db-snapshot-$timestamp.json"
$mailpitPath = Join-Path $reportDir "sprint10-mailpit-$timestamp.json"

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
        TimeoutSec = 30
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

function Wait-ForApi {
    param([string]$HealthUrl)

    for ($i = 0; $i -lt 60; $i += 1) {
        try {
            $resp = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 5
            if ($resp.StatusCode -eq 200) {
                return
            }
        } catch {
        }
        Start-Sleep -Seconds 2
    }
    throw "API health check failed at $HealthUrl"
}

function Invoke-DbScalarJson {
    param(
        [Parameter(Mandatory = $true)][string]$Sql
    )

    $composeArgs = @("-f", (Join-Path $repoRoot "docker-compose.yml"), "exec", "-T", "postgres", "psql", "-U", "postgres", "-d", "xamina", "-t", "-A", "-c", $Sql)
    $result = & docker compose @composeArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to run DB query through docker compose"
    }
    ($result | Out-String).Trim()
}

function Invoke-DbExec {
    param(
        [Parameter(Mandatory = $true)][string]$Sql
    )

    $composeArgs = @("-f", (Join-Path $repoRoot "docker-compose.yml"), "exec", "-T", "postgres", "psql", "-U", "postgres", "-d", "xamina", "-c", $Sql)
    $result = & docker compose @composeArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to execute DB query through docker compose"
    }
    ($result | Out-String).Trim()
}

$healthUrl = (($ApiBaseUrl -replace "/api/v1$", "").TrimEnd("/")) + "/health"
Wait-ForApi -HealthUrl $healthUrl

$summary = [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    api_base_url = $ApiBaseUrl
    tenant_slug = $TenantSlug
    admin_email = $AdminEmail
    artifacts = [ordered]@{
        summary = [IO.Path]::GetFileName($summaryPath)
        certificate_batch = $null
        broadcast = $null
        db_snapshot = [IO.Path]::GetFileName($dbSnapshotPath)
        mailpit = [IO.Path]::GetFileName($mailpitPath)
    }
}

$adminLogin = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/auth/login" -Body @{
    email = $AdminEmail
    password = $AdminPassword
    tenant_slug = $TenantSlug
}
Assert-SuccessResponse -Response $adminLogin -StepName "admin login"
$adminToken = $adminLogin.data.access_token
$adminHeaders = @{ Authorization = "Bearer $adminToken" }

$existingExams = Invoke-ApiJson -Method GET -Uri "$ApiBaseUrl/exams?page=1&page_size=200" -Headers $adminHeaders
Assert-SuccessResponse -Response $existingExams -StepName "list existing exams"
foreach ($item in @($existingExams.data)) {
    if ($item.title -like "Sprint 10 Runtime *" -and $item.status -eq "published") {
        $unpublish = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/exams/$($item.id)/unpublish" -Headers $adminHeaders -Body @{}
        Assert-SuccessResponse -Response $unpublish -StepName "unpublish stale sprint10 exam"
    }
}

$suffix = Get-Date -Format "yyyyMMddHHmmss"
$studentEmail = "sprint10-$suffix@xamina.local"
$studentPassword = "Student123!"

$studentUser = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/users" -Headers $adminHeaders -Body @{
    email = $studentEmail
    name = "Sprint10 Student $suffix"
    role = "siswa"
    password = $studentPassword
}
Assert-SuccessResponse -Response $studentUser -StepName "create student"

$questions = @(
    @{ type = "multiple_choice"; content = "Sprint 10 MC"; options_jsonb = @(@{ id = "A"; label = "1" }, @{ id = "B"; label = "2" }); answer_key = "B"; topic = "Sprint10"; difficulty = "easy" },
    @{ type = "true_false"; content = "Sprint 10 TF"; options_jsonb = @(@{ value = $true }, @{ value = $false }); answer_key = $true; topic = "Sprint10"; difficulty = "easy" },
    @{ type = "short_answer"; content = "Ibukota Indonesia"; options_jsonb = @(); answer_key = "jakarta"; topic = "Sprint10"; difficulty = "easy" }
)

$questionIds = @()
foreach ($question in $questions) {
    $resp = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/questions" -Headers $adminHeaders -Body $question
    Assert-SuccessResponse -Response $resp -StepName "create question"
    $questionIds += $resp.data.id
}

$startAt = (Get-Date).ToUniversalTime().AddMinutes(-5).ToString("yyyy-MM-ddTHH:mm:ssZ")
$endAt = (Get-Date).ToUniversalTime().AddHours(1).ToString("yyyy-MM-ddTHH:mm:ssZ")
$exam = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/exams" -Headers $adminHeaders -Body @{
    title = "Sprint 10 Runtime $suffix"
    duration_minutes = 60
    pass_score = 70
    shuffle_questions = $false
    shuffle_options = $false
    start_at = $startAt
    end_at = $endAt
}
Assert-SuccessResponse -Response $exam -StepName "create exam"
$examId = $exam.data.id

$attach = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/exams/$examId/questions" -Headers $adminHeaders -Body @{
    question_ids = $questionIds
}
Assert-SuccessResponse -Response $attach -StepName "attach questions"

$publish = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/exams/$examId/publish" -Headers $adminHeaders -Body @{}
Assert-SuccessResponse -Response $publish -StepName "publish exam"

$studentLogin = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/auth/login" -Body @{
    email = $studentEmail
    password = $studentPassword
    tenant_slug = $TenantSlug
}
Assert-SuccessResponse -Response $studentLogin -StepName "student login"
$studentUserId = $studentLogin.data.user.id
$studentToken = $studentLogin.data.access_token
$studentHeaders = @{ Authorization = "Bearer $studentToken" }

$subscription = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/notifications/push/subscribe" -Headers $studentHeaders -Body @{
    endpoint = "http://invalid-push-endpoint.local/sprint10"
    keys = @{
        p256dh = "invalid-p256dh"
        auth = "invalid-auth"
    }
    user_agent = "sprint10-runtime-evidence"
}
Assert-SuccessResponse -Response $subscription -StepName "subscribe invalid push"

$startSubmission = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/exams/$examId/start" -Headers $studentHeaders -Body @{}
Assert-SuccessResponse -Response $startSubmission -StepName "start submission"
$submissionId = $startSubmission.data.submission_id

$session = Invoke-ApiJson -Method GET -Uri "$ApiBaseUrl/submissions/$submissionId" -Headers $studentHeaders
Assert-SuccessResponse -Response $session -StepName "get submission session"

$answers = foreach ($question in $session.data.questions) {
    $answer = if ($question.type -eq "multiple_choice") {
        "B"
    } elseif ($question.type -eq "true_false") {
        $true
    } else {
        "jakarta"
    }

    @{
        question_id = $question.question_id
        answer = $answer
        is_bookmarked = $false
    }
}

$saveAnswers = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/submissions/$submissionId/answers" -Headers $studentHeaders -Body @{
    answers = $answers
}
Assert-SuccessResponse -Response $saveAnswers -StepName "save answers"

$finish = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/submissions/$submissionId/finish" -Headers $studentHeaders -Body @{}
Assert-SuccessResponse -Response $finish -StepName "finish submission"

$certificate = Invoke-ApiJson -Method GET -Uri "$ApiBaseUrl/submissions/$submissionId/certificate" -Headers $studentHeaders
Assert-SuccessResponse -Response $certificate -StepName "get certificate"

& (Join-Path $PSScriptRoot "run_sprint10_certificate_batch.ps1") -ApiBaseUrl $ApiBaseUrl -Token $studentToken -SubmissionIds @($submissionId)
$latestCertBatch = Get-ChildItem $reportDir -Filter "sprint10-certificate-batch-*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latestCertBatch) {
    $summary.artifacts.certificate_batch = $latestCertBatch.Name
}

& (Join-Path $PSScriptRoot "run_sprint10_delivery_smoke.ps1") -ApiBaseUrl $ApiBaseUrl -Token $adminToken
$latestBroadcast = Get-ChildItem $reportDir -Filter "sprint10-delivery-smoke-*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latestBroadcast) {
    $summary.artifacts.broadcast = $latestBroadcast.Name
}

$tenantId = $studentLogin.data.user.tenant_id
$retryEmailSubject = "Sprint10 Retry Probe $suffix"
$retryEmailJobId = (Invoke-DbScalarJson -Sql "INSERT INTO email_jobs (tenant_id, user_id, certificate_id, to_email, subject, body, status, attempts, max_attempts, next_attempt_at) VALUES ('$tenantId'::uuid, '$studentUserId'::uuid, NULL, 'invalid-email-address', '$retryEmailSubject', 'forcing retry evidence', 'queued', 0, 5, NOW()) RETURNING id;")

# Worker polls every ~2s; invalid recipient forces deterministic retry.
Start-Sleep -Seconds 6

$mailpitMessages = Invoke-RestMethod -Method GET -Uri "$MailpitApiBaseUrl/messages" -TimeoutSec 20
$mailpitMessages | ConvertTo-Json -Depth 8 | Set-Content $mailpitPath

$retryEmailCount = [int](Invoke-DbScalarJson -Sql "SELECT COUNT(*) FROM email_jobs WHERE tenant_id = '$tenantId'::uuid AND status IN ('retry', 'failed');")
$latestPushReceiptToken = (Invoke-DbScalarJson -Sql "SELECT receipt_token::text FROM push_jobs WHERE tenant_id = '$tenantId'::uuid ORDER BY created_at DESC LIMIT 1;")
if (-not [string]::IsNullOrWhiteSpace($latestPushReceiptToken)) {
    $receiptResp = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/notifications/push/receipt" -Body @{
        receipt_token = $latestPushReceiptToken.Trim()
        event_type = "received"
        event_at = (Get-Date).ToUniversalTime().ToString("o")
        metadata = @{
            source = "runtime_evidence_script"
            probe = "sprint10"
        }
    }
    Assert-SuccessResponse -Response $receiptResp -StepName "record push receipt probe"
}
$pushReceivedReceiptCount = [int](Invoke-DbScalarJson -Sql "SELECT COUNT(*) FROM push_delivery_receipts WHERE tenant_id = '$tenantId'::uuid AND event_type = 'received';")
$dbSnapshot = [ordered]@{
    certificate_rows = (Invoke-DbScalarJson -Sql "SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text FROM (SELECT id, certificate_no, submission_id, student_id, file_url FROM certificates WHERE submission_id = '$submissionId'::uuid) t;" | ConvertFrom-Json)
    email_jobs = (Invoke-DbScalarJson -Sql "SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text FROM (SELECT id, status, attempts, max_attempts, last_error, sent_at, subject FROM email_jobs WHERE tenant_id = '$tenantId'::uuid ORDER BY created_at DESC LIMIT 10) t;" | ConvertFrom-Json)
    retry_email_jobs = (Invoke-DbScalarJson -Sql "SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text FROM (SELECT id, status, attempts, max_attempts, last_error, sent_at, subject FROM email_jobs WHERE tenant_id = '$tenantId'::uuid AND status IN ('retry', 'failed') ORDER BY created_at DESC LIMIT 5) t;" | ConvertFrom-Json)
    push_jobs = (Invoke-DbScalarJson -Sql "SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text FROM (SELECT id, receipt_token, status, attempts, max_attempts, last_error, sent_at, receipt_received_at, receipt_clicked_at FROM push_jobs WHERE tenant_id = '$tenantId'::uuid ORDER BY created_at DESC LIMIT 10) t;" | ConvertFrom-Json)
    push_delivery_receipts = (Invoke-DbScalarJson -Sql "SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text FROM (SELECT id, push_job_id, event_type, event_at, created_at, metadata_jsonb FROM push_delivery_receipts WHERE tenant_id = '$tenantId'::uuid ORDER BY created_at DESC LIMIT 10) t;" | ConvertFrom-Json)
    push_subscriptions = (Invoke-DbScalarJson -Sql "SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text FROM (SELECT id, endpoint, created_at FROM push_subscriptions WHERE tenant_id = '$tenantId'::uuid ORDER BY created_at DESC LIMIT 5) t;" | ConvertFrom-Json)
}
$dbSnapshot | ConvertTo-Json -Depth 8 | Set-Content $dbSnapshotPath

$summary.student = [ordered]@{
    email = $studentEmail
    submission_id = $submissionId
    certificate_id = $certificate.data.id
    certificate_no = $certificate.data.certificate_no
    certificate_url = $certificate.data.file_url
}
$summary.runtime = [ordered]@{
    passed = $finish.data.passed
    score = $finish.data.score
    total_questions = $finish.data.total_questions
    mailpit_message_count = @($mailpitMessages.messages).Count
    retry_email_jobs_count = $retryEmailCount
    push_receipt_received_count = $pushReceivedReceiptCount
    push_receipt_probe_token = $latestPushReceiptToken
    retry_probe_email_job_id = $retryEmailJobId
}
if ($retryEmailCount -lt 1) {
    throw "Retry/failure evidence was not captured for email_jobs."
}
if ($pushReceivedReceiptCount -lt 1) {
    throw "Push receipt evidence (event_type=received) was not captured."
}
$summary.db_snapshot = $dbSnapshot

$summary | ConvertTo-Json -Depth 10 | Set-Content $summaryPath
Write-Host "Sprint 10 runtime evidence saved: $summaryPath"
