param(
    [string]$PythonPath = "python"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDirectory = Join-Path $PSScriptRoot "logs"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogPath = Join-Path $LogDirectory "scheduled-etl-$Timestamp.log"

New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null
Start-Transcript -Path $LogPath | Out-Null
try {
    Push-Location $ProjectRoot
    & $PythonPath (Join-Path $PSScriptRoot "run_due_etl.py") --apply
    if ($LASTEXITCODE -ne 0) {
        throw "Scheduled ETL exited with code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
    Stop-Transcript | Out-Null
}
