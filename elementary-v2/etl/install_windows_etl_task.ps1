param(
    [string]$TaskName = "Elementary ETL Daily Check",
    [string]$DailyTime = "03:15",
    [string]$PythonPath = "python"
)

$ErrorActionPreference = "Stop"
$Runner = Join-Path $PSScriptRoot "run_scheduled_etl.ps1"
$PowerShellPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$UserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
if ($PythonPath -eq "python") {
    $PythonPath = (Get-Command python -ErrorAction Stop).Source
}

$action = New-ScheduledTaskAction `
    -Execute $PowerShellPath `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Runner`" -PythonPath `"$PythonPath`"" `
    -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
$trigger = New-ScheduledTaskTrigger -Daily -At $DailyTime
$principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 4)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Checks Supabase ETL schedules and refreshes due elementary-school sources." `
    -Force | Out-Null

Write-Host "Registered '$TaskName' for $DailyTime under $UserId."
Write-Host "The default Interactive logon type runs only while this Windows user is logged in."
