$ErrorActionPreference = "Stop"

$perlCandidates = @()
$perlCandidates += @(
    "C:\Strawberry\perl\bin\perl.exe",
    "C:\Perl64\bin\perl.exe",
    "C:\Program Files\Git\usr\bin\perl.exe"
)

try {
    $resolvedPerl = (Get-Command perl -ErrorAction Stop).Source
    if ($resolvedPerl) {
        $perlCandidates += $resolvedPerl
    }
} catch {
}

$perlPath = $perlCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $perlPath) {
    throw "Perl not found. Install Git for Windows or Strawberry Perl, or set PERL before running this script."
}

$env:PERL = $perlPath
Write-Host "Using PERL=$perlPath"
cargo check -p api --features real_web_push
