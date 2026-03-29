param(
    [Parameter(Mandatory = $true)][string]$BackupFile,
    [string]$ComposeFile = "docker-compose.yml",
    [string]$ServiceName = "postgres",
    [string]$DbName = "xamina",
    [string]$DbUser = "postgres",
    [switch]$DropAndRecreate
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$composePath = Join-Path $repoRoot $ComposeFile
$resolvedBackupFile = if ([System.IO.Path]::IsPathRooted($BackupFile)) { $BackupFile } else { Join-Path $repoRoot $BackupFile }

if (-not (Test-Path $resolvedBackupFile)) {
    throw "Backup file not found: $resolvedBackupFile"
}

if ($DropAndRecreate) {
    $sql = "DROP SCHEMA IF EXISTS app CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;"
    & docker compose -f $composePath exec -T $ServiceName psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -c $sql | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to reset schema before restore."
    }
}

$restoreArgs = @(
    "-f", $composePath,
    "exec", "-T", $ServiceName,
    "pg_restore",
    "-U", $DbUser,
    "-d", $DbName,
    "--no-owner",
    "--no-privileges"
)

Write-Host "Restoring backup from $resolvedBackupFile..."
Get-Content -Path $resolvedBackupFile -Encoding Byte -ReadCount 0 | & docker compose @restoreArgs
if ($LASTEXITCODE -ne 0) {
    throw "Restore failed."
}

Write-Host "Restore completed."
