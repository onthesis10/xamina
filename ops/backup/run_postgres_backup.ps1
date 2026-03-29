param(
    [string]$ComposeFile = "docker-compose.yml",
    [string]$ServiceName = "postgres",
    [string]$DbName = "xamina",
    [string]$DbUser = "postgres",
    [string]$OutputDir = "ops\backup\artifacts"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$composePath = Join-Path $repoRoot $ComposeFile
$targetDir = Join-Path $repoRoot $OutputDir
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = Join-Path $targetDir "xamina-backup-$timestamp.dump"

$dumpArgs = @(
    "-f", $composePath,
    "exec", "-T", $ServiceName,
    "pg_dump",
    "-U", $DbUser,
    "-d", $DbName,
    "-Fc"
)

Write-Host "Running pg_dump from service '$ServiceName'..."
& docker compose @dumpArgs > $backupFile
if ($LASTEXITCODE -ne 0) {
    throw "Backup failed."
}

Write-Host "Backup created: $backupFile"
