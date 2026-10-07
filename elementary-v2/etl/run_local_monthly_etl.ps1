param(
    [string]$PythonPath = "python"
)

# Monthly ETL steps that must run from a machine in Korea: VWorld refuses foreign
# IPs, so GitHub runners cannot geocode. Registered by install_local_monthly_task.ps1
# for the evening before the GitHub monthly run.
#
#   1. supplement build_apartment_supplement.py --fetch-kapt --upload  (new complexes to Storage)
#   2. academy    run_academy_refresh.py --geocode-only  (cache + dojo copy to Storage)
#   3. care       collect_care_data.py --apply           (school care disclosure, care centers)
#
# Each step runs even if the one before failed. Any failure opens (or comments on)
# a GitHub issue labelled etl-failure, the same channel the Actions run uses.

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDirectory = Join-Path $PSScriptRoot "logs"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogPath = Join-Path $LogDirectory "local-monthly-etl-$Timestamp.log"
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"
$Repository = "Sean-Kang-jpg/elementary"

$Steps = @(
    @{ Name = "supplement"; Arguments = @((Join-Path $PSScriptRoot "build_apartment_supplement.py"), "--fetch-kapt", "--upload") },
    @{ Name = "academy"; Arguments = @((Join-Path $PSScriptRoot "run_academy_refresh.py"), "--geocode-only") },
    @{ Name = "care"; Arguments = @((Join-Path $PSScriptRoot "collect_care_data.py"), "--apply") }
)

New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null
Start-Transcript -Path $LogPath | Out-Null
$Failed = @()
try {
    Push-Location $ProjectRoot
    foreach ($Step in $Steps) {
        # The transcript does not reliably keep a native program's output, so each
        # step writes its own log next to it.
        $StepLog = Join-Path $LogDirectory "local-monthly-etl-$Timestamp-$($Step.Name).log"
        Write-Host "=== $($Step.Name) -> $StepLog"
        # Windows PowerShell joins -ArgumentList with spaces and no quoting.
        $ArgumentLine = ($Step.Arguments | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }) -join ' '
        $Process = Start-Process -FilePath $PythonPath -ArgumentList $ArgumentLine -WorkingDirectory $ProjectRoot `
            -NoNewWindow -Wait -PassThru -RedirectStandardOutput $StepLog -RedirectStandardError "$StepLog.err"
        Get-Content "$StepLog.err" -Encoding UTF8 | Add-Content $StepLog -Encoding UTF8
        Remove-Item "$StepLog.err"
        Get-Content $StepLog -Tail 3 -Encoding UTF8 | ForEach-Object { Write-Host $_ }
        if ($Process.ExitCode -ne 0) {
            Write-Host "$($Step.Name) exited with code $($Process.ExitCode)"
            $Failed += $Step.Name
        }
    }
}
finally {
    Pop-Location
    Stop-Transcript | Out-Null
}

if ($Failed.Count -gt 0) {
    $Gh = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $Gh) { Write-Host "gh CLI not found; no failure issue opened" }
    if ($Gh) {
        $Body = "이 PC의 월간 ETL 작업에서 실패한 단계: $($Failed -join ', ')`n로그: $LogPath (단계별: local-monthly-etl-$Timestamp-<단계>.log)`n해당 단계를 고친 뒤 install_local_monthly_task.ps1 작업을 다시 실행(Start-ScheduledTask)하고 이 이슈를 닫으세요."
        $Open = & $Gh.Source issue list --repo $Repository --label etl-failure --state open --search "Windows" --json number --jq ".[0].number"
        if ($Open) {
            & $Gh.Source issue comment $Open --repo $Repository --body $Body
        } else {
            & $Gh.Source issue create --repo $Repository --label etl-failure --title "월간 ETL 실패 (Windows 작업) $(Get-Date -Format yyyy-MM-dd)" --body $Body
        }
    }
    exit 1
}
