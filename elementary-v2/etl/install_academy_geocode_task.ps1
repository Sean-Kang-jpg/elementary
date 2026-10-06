param(
    [string]$TaskName = "Elementary Academy Geocode",
    [int]$DayOfMonth = 1,
    [string]$StartTime = "21:00",
    [string]$PythonPath = "python"
)

# Monthly, the evening before the GitHub monthly ETL (2nd, 03:15 KST), so the runner
# restores a cache that already holds this month's new academy addresses.
# StartWhenAvailable: if this machine is off at that time, the task runs at the next
# start; a run after the 2nd simply serves the following month.

$ErrorActionPreference = "Stop"
$Runner = Join-Path $PSScriptRoot "run_academy_geocode.ps1"
$PowerShellPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
if ($PythonPath -eq "python") {
    $PythonPath = (Get-Command python -ErrorAction Stop).Source
}
$Command = "`"$PowerShellPath`" -NoProfile -ExecutionPolicy Bypass -File `"$Runner`" -PythonPath `"$PythonPath`""

# New-ScheduledTaskTrigger has no monthly trigger; schtasks does.
& schtasks.exe /Create /F /TN $TaskName /SC MONTHLY /D $DayOfMonth /ST $StartTime /TR $Command /RL LIMITED | Out-Null
if ($LASTEXITCODE -ne 0) { throw "schtasks failed with code $LASTEXITCODE" }

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Set-ScheduledTask -TaskName $TaskName -Settings $settings | Out-Null

Write-Host "Registered '$TaskName': day $DayOfMonth of every month at $StartTime."
Write-Host "It runs only while this Windows user is logged in; logs go to etl/logs/academy-geocode-*.log."
