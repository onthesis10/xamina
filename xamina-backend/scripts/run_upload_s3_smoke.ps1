$ErrorActionPreference = "Stop"

$apiBaseUrl = if ($env:API_BASE_URL) { $env:API_BASE_URL } else { "http://localhost:8080/api/v1" }
$tenantSlug = if ($env:TENANT_SLUG) { $env:TENANT_SLUG } else { "default" }
$adminEmail = if ($env:ADMIN_EMAIL) { $env:ADMIN_EMAIL } else { "admin@xamina.local" }
$adminPassword = if ($env:ADMIN_PASSWORD) { $env:ADMIN_PASSWORD } else { "Admin123!" }

Write-Host "[1/3] Login admin..."
$loginBody = @{
  email = $adminEmail
  password = $adminPassword
  tenant_slug = $tenantSlug
} | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/auth/login" -ContentType "application/json" -Body $loginBody
$token = $login.data.access_token
if (-not $token) { throw "Failed to acquire access token" }

Write-Host "[2/3] Prepare tiny PNG..."
$pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+R0YAAAAASUVORK5CYII="
$tempFile = Join-Path $env:TEMP "xamina-upload-smoke.png"
[IO.File]::WriteAllBytes($tempFile, [Convert]::FromBase64String($pngBase64))

Write-Host "[3/3] Upload question image (s3 mode expected)..."
$headers = @{ Authorization = "Bearer $token" }
$curl = Get-Command curl.exe -ErrorAction SilentlyContinue
if (-not $curl) { throw "curl.exe is required for multipart upload smoke test on this PowerShell version." }

$uploadRaw = & curl.exe -sS -X POST `
  -H "Authorization: Bearer $token" `
  -F "file=@$tempFile;type=image/png" `
  "$apiBaseUrl/uploads/question-image"

if ($LASTEXITCODE -ne 0) {
  throw "curl upload failed with exit code $LASTEXITCODE"
}

$upload = $uploadRaw | ConvertFrom-Json
if (-not $upload.data.image_url) { throw "Upload did not return image_url" }
if (-not $upload.data.image_url.Contains("/xamina/")) {
  throw "Upload image_url does not look like S3 public path: $($upload.data.image_url)"
}
Write-Host "Upload OK:" $upload.data.image_url
