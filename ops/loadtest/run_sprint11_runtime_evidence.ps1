param(
    [string]$ApiBaseUrl = "http://127.0.0.1:8080/api/v1",
    [string]$TenantSlug = "default",
    [string]$AdminEmail = "admin@xamina.local",
    [string]$AdminPassword = "Admin123!",
    [int]$SubmissionCount = 200,
    [int]$QuestionCount = 40
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$reportDir = Join-Path $repoRoot "ops\load\reports"
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$summaryPath = Join-Path $reportDir "sprint11-runtime-evidence-$timestamp.json"
$insightsPath = Join-Path $reportDir "sprint11-insights-$timestamp.json"
$dbSnapshotPath = Join-Path $reportDir "sprint11-db-snapshot-$timestamp.json"
$xlsxPath = Join-Path $reportDir "sprint11-exam-insights-$timestamp.xlsx"

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
        TimeoutSec = 60
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

function Invoke-DbScalar {
    param([Parameter(Mandatory = $true)][string]$Sql)

    $args = @(
        "-f", (Join-Path $repoRoot "docker-compose.yml"),
        "exec", "-T", "postgres",
        "psql", "-U", "postgres", "-d", "xamina", "-t", "-A", "-c", $Sql
    )
    $result = & docker compose @args
    if ($LASTEXITCODE -ne 0) {
        throw "DB scalar query failed"
    }
    ($result | Out-String).Trim()
}

function Invoke-DbSqlText {
    param([Parameter(Mandatory = $true)][string]$Sql)

    $args = @(
        "-f", (Join-Path $repoRoot "docker-compose.yml"),
        "exec", "-T", "postgres",
        "psql", "-U", "postgres", "-d", "xamina", "-v", "ON_ERROR_STOP=1"
    )
    $Sql | & docker compose @args
    if ($LASTEXITCODE -ne 0) {
        throw "DB SQL batch failed"
    }
}

$healthUrl = (($ApiBaseUrl -replace "/api/v1$", "").TrimEnd("/")) + "/health"
Wait-ForApi -HealthUrl $healthUrl

$login = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/auth/login" -Body @{
    email = $AdminEmail
    password = $AdminPassword
    tenant_slug = $TenantSlug
}
if (-not $login.success) { throw "Admin login failed." }
$adminToken = $login.data.access_token
$adminHeaders = @{ Authorization = "Bearer $adminToken" }
$tenantId = $login.data.user.tenant_id

$existingExams = Invoke-ApiJson -Method GET -Uri "$ApiBaseUrl/exams?page=1&page_size=500" -Headers $adminHeaders
if ($existingExams.success) {
    foreach ($examItem in @($existingExams.data)) {
        if ($examItem.title -like "Sprint 11 Runtime *" -and $examItem.status -eq "published") {
            $unpublish = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/exams/$($examItem.id)/unpublish" -Headers $adminHeaders -Body @{}
            if (-not $unpublish.success) {
                throw "Failed to unpublish stale sprint11 runtime exam."
            }
        }
    }
}

$questionPayloads = @()
for ($i = 1; $i -le $QuestionCount; $i += 1) {
    $payload = @{
        type = "multiple_choice"
        content = "Sprint11 Q$i"
        options_jsonb = @(
            @{ id = "A"; label = "Benar $i" },
            @{ id = "B"; label = "Salah $i" }
        )
        answer_key = "A"
        topic = "Sprint11"
        difficulty = "medium"
    }
    $created = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/questions" -Headers $adminHeaders -Body $payload
    if (-not $created.success) { throw "Create question failed at index $i" }
    $questionPayloads += @{
        question_id = $created.data.id
        type = "multiple_choice"
        content = "Sprint11 Q$i"
        options_jsonb = @(
            @{ id = "A"; label = "Benar $i" },
            @{ id = "B"; label = "Salah $i" }
        )
        answer_key = "A"
        topic = "Sprint11"
        difficulty = "medium"
        image_url = $null
    }
}

$startAt = (Get-Date).ToUniversalTime().AddHours(-2).ToString("yyyy-MM-ddTHH:mm:ssZ")
$endAt = (Get-Date).ToUniversalTime().AddHours(8).ToString("yyyy-MM-ddTHH:mm:ssZ")
$exam = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/exams" -Headers $adminHeaders -Body @{
    title = "Sprint 11 Runtime $timestamp"
    duration_minutes = 90
    pass_score = 70
    shuffle_questions = $false
    shuffle_options = $false
    start_at = $startAt
    end_at = $endAt
}
if (-not $exam.success) { throw "Create exam failed." }
$examId = $exam.data.id

$attach = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/exams/$examId/questions" -Headers $adminHeaders -Body @{
    question_ids = @($questionPayloads | ForEach-Object { $_.question_id })
}
if (-not $attach.success) { throw "Attach questions failed." }

$publish = Invoke-ApiJson -Method POST -Uri "$ApiBaseUrl/exams/$examId/publish" -Headers $adminHeaders -Body @{}
if (-not $publish.success) { throw "Publish exam failed." }

$classId = [guid]::NewGuid().ToString()
$className = "Sprint11 Class $timestamp"
$snapshotJson = ($questionPayloads | ConvertTo-Json -Depth 8 -Compress)
$snapshotSql = $snapshotJson.Replace("'", "''")

$seedSql = New-Object System.Text.StringBuilder
[void]$seedSql.AppendLine("BEGIN;")
[void]$seedSql.AppendLine("INSERT INTO classes (id, tenant_id, name, grade, major) VALUES ('$classId'::uuid, '$tenantId'::uuid, '$className', 'XI', 'IPA');")

$random = [System.Random]::new()
for ($s = 1; $s -le $SubmissionCount; $s += 1) {
    $userId = [guid]::NewGuid().ToString()
    $submissionId = [guid]::NewGuid().ToString()
    $email = "sprint11-$timestamp-$s@xamina.local"
    $name = "Sprint11 Student $s"
    $passwordHash = "Seeded123!"
    $finishOffsetHours = -1 * $random.Next(0, 7 * 24)
    $finishedAt = (Get-Date).ToUniversalTime().AddHours($finishOffsetHours).AddMinutes(-1 * $random.Next(0, 59))
    $startedAt = $finishedAt.AddMinutes(-90)
    $deadlineAt = $startedAt.AddMinutes(90)
    $correct = 0

    [void]$seedSql.AppendLine("INSERT INTO users (id, tenant_id, email, password_hash, name, role, class_id, is_active) VALUES ('$userId'::uuid, '$tenantId'::uuid, '$email', '$passwordHash', '$name', 'siswa', '$classId'::uuid, TRUE);")

    $answerSqlRows = New-Object System.Collections.Generic.List[string]
    foreach ($question in $questionPayloads) {
        $isCorrect = $random.NextDouble() -lt 0.62
        if ($isCorrect) { $correct += 1 }
        $answerValue = if ($isCorrect) { '"A"' } else { '"B"' }
        $questionId = $question.question_id
        $answerSqlRows.Add("('$submissionId'::uuid, '$questionId'::uuid, '$answerValue'::jsonb, FALSE, NOW())")
    }

    $score = [Math]::Round(($correct / $QuestionCount) * 100.0, 2)
    [void]$seedSql.AppendLine(
        "INSERT INTO submissions (id, tenant_id, exam_id, student_id, status, started_at, finished_at, deadline_at, question_order_jsonb, score, correct_count, total_questions, created_at, updated_at) VALUES ('$submissionId'::uuid, '$tenantId'::uuid, '$examId'::uuid, '$userId'::uuid, 'finished', '$($startedAt.ToString("yyyy-MM-ddTHH:mm:ssZ"))'::timestamptz, '$($finishedAt.ToString("yyyy-MM-ddTHH:mm:ssZ"))'::timestamptz, '$($deadlineAt.ToString("yyyy-MM-ddTHH:mm:ssZ"))'::timestamptz, '$snapshotSql'::jsonb, $score, $correct, $QuestionCount, NOW(), NOW());"
    )
    [void]$seedSql.AppendLine(
        "INSERT INTO submission_answers (submission_id, question_id, answer_jsonb, is_bookmarked, updated_at) VALUES $([string]::Join(',', $answerSqlRows));"
    )
}
[void]$seedSql.AppendLine("COMMIT;")
Invoke-DbSqlText -Sql $seedSql.ToString()

$warmupInsights = Invoke-ApiJson -Method GET -Uri "$ApiBaseUrl/reports/exam-insights?exam_id=$examId" -Headers $adminHeaders
if (-not $warmupInsights.success) {
    throw "Exam insights warmup call failed."
}

$insightsLatencyMs = 0.0
$insightsResponse = $null
$insightsLatency = Measure-Command {
    $insightsResponse = Invoke-ApiJson -Method GET -Uri "$ApiBaseUrl/reports/exam-insights?exam_id=$examId" -Headers $adminHeaders
}
$insightsLatencyMs = $insightsLatency.TotalMilliseconds
if (-not $insightsResponse.success) { throw "Exam insights endpoint failed." }
$insightsResponse | ConvertTo-Json -Depth 10 | Set-Content $insightsPath

$xlsxLatencyMs = 0.0
$xlsxLatency = Measure-Command {
    Invoke-WebRequest -Method GET -Uri "$ApiBaseUrl/reports/exam-insights/export.xlsx?exam_id=$examId" -Headers $adminHeaders -TimeoutSec 120 -OutFile $xlsxPath | Out-Null
}
$xlsxLatencyMs = $xlsxLatency.TotalMilliseconds

$dbSnapshot = [ordered]@{
    tenant_id = $tenantId
    exam_id = $examId
    seeded_questions = $QuestionCount
    seeded_submissions = $SubmissionCount
    submissions_count_db = [int](Invoke-DbScalar -Sql "SELECT COUNT(*) FROM submissions WHERE tenant_id = '$tenantId'::uuid AND exam_id = '$examId'::uuid AND status IN ('finished','auto_finished');")
    submission_answers_count_db = [int](Invoke-DbScalar -Sql "SELECT COUNT(*) FROM submission_answers sa JOIN submissions s ON s.id = sa.submission_id WHERE s.tenant_id = '$tenantId'::uuid AND s.exam_id = '$examId'::uuid;")
    item_analysis_count = [int](($insightsResponse.data.item_analysis | Measure-Object).Count)
}
$dbSnapshot | ConvertTo-Json -Depth 8 | Set-Content $dbSnapshotPath

$summary = [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    api_base_url = $ApiBaseUrl
    tenant_slug = $TenantSlug
    runtime = [ordered]@{
        insights_latency_ms = [Math]::Round($insightsLatencyMs, 2)
        xlsx_latency_ms = [Math]::Round($xlsxLatencyMs, 2)
        latency_target_ms = 2000
        latency_target_passed = ($insightsLatencyMs -le 2000)
    }
    dataset = [ordered]@{
        question_count = $QuestionCount
        submission_count = $SubmissionCount
    }
    artifacts = [ordered]@{
        summary = [IO.Path]::GetFileName($summaryPath)
        insights = [IO.Path]::GetFileName($insightsPath)
        db_snapshot = [IO.Path]::GetFileName($dbSnapshotPath)
        xlsx = [IO.Path]::GetFileName($xlsxPath)
    }
}
$summary | ConvertTo-Json -Depth 10 | Set-Content $summaryPath

Write-Host "Sprint 11 runtime evidence saved: $summaryPath"
