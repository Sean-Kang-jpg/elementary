param(
    [string]$PythonPath = "python"
)

# Geocodes new academy addresses from this machine (VWorld refuses foreign IPs, so
# GitHub runners cannot) and writes the cache to Storage for the monthly run.
# Registered by install_academy_geocode_task.ps1.

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDirectory = Join-Path $PSScriptRoot "logs"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogPath = Join-Path $LogDirectory "academy-geocode-$Timestamp.log"
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"

New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null
Start-Transcript -Path $LogPath | Out-Null
try {
    Push-Location $ProjectRoot
    & $PythonPath (Join-Path $PSScriptRoot "run_academy_refresh.py") --geocode-only
    if ($LASTEXITCODE -ne 0) {
        throw "Academy geocoding exited with code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
    Stop-Transcript | Out-Null
}
