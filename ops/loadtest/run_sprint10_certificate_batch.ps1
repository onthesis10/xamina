param(
    [string]$ApiBaseUrl = "http://127.0.0.1:8080/api/v1",
    [string]$Token = "",
    [string[]]$SubmissionIds = @(),
    [int]$PauseMs = 100
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Token)) {
    throw "Token is required. Pass -Token '<bearer-token>'"
}
if ($SubmissionIds.Count -eq 0) {
    throw "SubmissionIds is empty. Pass -SubmissionIds @('id1','id2',...)"
}

$headers = @{
    Authorization = "Bearer $Token"
}

$result = @()
foreach ($submissionId in $SubmissionIds) {
    $url = "$ApiBaseUrl/submissions/$submissionId/certificate"
    try {
        $resp = Invoke-RestMethod -Method GET -Uri $url -Headers $headers -TimeoutSec 20
        $result += [PSCustomObject]@{
            submission_id = $submissionId
            success = $true
            certificate_id = $resp.data.id
            certificate_no = $resp.data.certificate_no
            file_url = $resp.data.file_url
        }
    } catch {
        $result += [PSCustomObject]@{
            submission_id = $submissionId
            success = $false
            error = $_.Exception.Message
        }
    }
    Start-Sleep -Milliseconds $PauseMs
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportDir = Join-Path (Resolve-Path "$PSScriptRoot\..\load\reports") "."
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
$outPath = Join-Path $reportDir "sprint10-certificate-batch-$timestamp.json"
$result | ConvertTo-Json -Depth 5 | Set-Content $outPath
Write-Host "Certificate batch report: $outPath"
