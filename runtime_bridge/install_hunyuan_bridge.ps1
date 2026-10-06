param(
  [string]$Repo = 'C:\Users\Gordo\Projects\ascension-nexus-weave'
)

$ErrorActionPreference = 'Stop'
$bridge = Join-Path $Repo 'runtime_bridge\ascension_hunyuan_bridge.ps1'
if (-not (Test-Path $bridge)) { throw "ASCENSION bridge not found: $bridge" }

$taskName = 'ASCENSION Hunyuan Bridge'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument (
  '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $bridge + '"'
)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

# Start it now as well as at every future logon.
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 2
$task = Get-ScheduledTask -TaskName $taskName
Write-Host ("ASCENSION Hunyuan Bridge: " + $task.State)
