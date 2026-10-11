param(
  [string]$Repo = 'C:\Users\Gordo\Projects\ascension-nexus-weave',
  [string]$HunyuanRoot = 'C:\AI\HY3D2\Hunyuan3D2_WinPortable'
)

$ErrorActionPreference = 'Stop'
$bridge = Join-Path $Repo 'runtime_bridge\ascension_hunyuan_bridge.ps1'
$worker = Join-Path $Repo 'runtime_bridge\hunyuan_model_worker.py'
$python = Join-Path $HunyuanRoot 'python_standalone\python.exe'
$logs = Join-Path $Repo 'runtime_bridge\logs'
if (-not (Test-Path $bridge)) { throw "Missing ASCENSION bridge: $bridge" }
if (-not (Test-Path $worker)) { throw "Missing model queue worker: $worker" }
if (-not (Test-Path $python)) { throw "Missing Hunyuan portable Python: $python" }
$token = [Environment]::GetEnvironmentVariable('ASCENSION_PUBLISH_TOKEN', 'User')
if ([string]::IsNullOrWhiteSpace($token)) {
  $token = [Environment]::GetEnvironmentVariable('ASCENSION_PUBLISH_TOKEN', 'Machine')
}
if ([string]::IsNullOrWhiteSpace($token)) {
  throw 'ASCENSION_PUBLISH_TOKEN is absent from User and Machine environment. Worker cannot claim jobs.'
}
# Do not print the secret.
# Install a persistent logon task where Windows permits it. Startup still works
# for this session if Scheduled Tasks registration needs elevation.
$taskName = 'ASCENSION Hunyuan Bridge'
if (-not (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) {
  try {
    & (Join-Path $Repo 'runtime_bridge\install_hunyuan_bridge.ps1') -Repo $Repo | Out-Null
    Write-Host 'Autostart task registered.'
  } catch {
    Write-Warning ('Autostart registration failed: ' + $_.Exception.Message)
  }
}
$existing = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -like '*powershell*.exe' -and
    $_.CommandLine -like '*-File*ascension_hunyuan_bridge.ps1*'
  })
if ($existing.Count -eq 0) {
  Write-Host 'Starting ASCENSION Hunyuan bridge...'
  Start-Process powershell.exe -WindowStyle Hidden -WorkingDirectory $Repo -ArgumentList @(
    '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden',
    '-File',('"' + $bridge + '"'),'-Repo',('"' + $Repo + '"'),
    '-HunyuanRoot',('"' + $HunyuanRoot + '"')
  )
} else {
  Write-Host 'ASCENSION Hunyuan bridge already running.'
}
$readyApi = $false
$readyWorker = $false
for ($attempt = 1; $attempt -le 24; $attempt++) {
  $readyApi = [bool](Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue)
  $readyWorker = [bool](Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'python*.exe' -and $_.CommandLine -like '*hunyuan_model_worker.py*' })
  if ($readyApi -and $readyWorker) { break }
  Start-Sleep -Seconds 5
}
Write-Host ('Hunyuan API on 127.0.0.1:8081: ' + $(if ($readyApi) {'LISTENING'} else {'NOT READY'}))
Write-Host ('ASCENSION model queue worker: ' + $(if ($readyWorker) {'RUNNING'} else {'NOT RUNNING'}))
if (-not ($readyApi -and $readyWorker)) {
  foreach ($name in @('hunyuan-api.err.log','hunyuan-worker.err.log','hunyuan-bridge.err.log')) {
    $log = Join-Path $logs $name
    if (Test-Path $log) {
      Write-Host ('=== ' + $name + ' (last 15 lines) ===')
      Get-Content $log -Tail 15
    }
  }
  throw 'Hunyuan startup incomplete. Errors above identify the failing component.'
}
Write-Host 'ASCENSION Hunyuan local bridge online; queued work can now be claimed.'
