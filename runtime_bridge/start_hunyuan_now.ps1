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
  Write-Host 'Remote publish token not configured. Local browser Hunyuan generation does not need it.'
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
# The previous launcher kept a stale background PowerShell bridge alive,
# so edited model settings never took effect. Restart ONLY this named bridge.
$existing = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -in @('powershell.exe','pwsh.exe') -and
    $_.CommandLine -like '*-File*ascension_hunyuan_bridge.ps1*'
  })
foreach ($process in $existing) {
  Write-Host ('Replacing stale ASCENSION Hunyuan manager PID ' + $process.ProcessId)
  Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
}
# A failed Hunyuan3D-2.1 process with the old 2.0 mini model identifier may
# still be initializing. Terminate ONLY that known invalid API invocation.
$wrongApi = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -like 'python*.exe' -and
    $_.CommandLine -like '*api_server.py*' -and
    $_.CommandLine -like '*--port*8081*' -and
    $_.CommandLine -like '*Hunyuan3D-2mini*'
  })
foreach ($process in $wrongApi) {
  Write-Host ('Stopping mismatched 2.0 weights API PID ' + $process.ProcessId)
  Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
}
# The bridge manager is now the SINGLE owner of both 8081 and 8082 launches.
# Starting an extra browser bridge here caused simultaneous attempts to
# redirect stdout to the same log file and could leave 8082 unavailable.
Write-Host 'Starting corrected ASCENSION Hunyuan manager...'
Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -WorkingDirectory $Repo -ArgumentList @(
  '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden',
  '-File',('"' + $bridge + '"'),'-Repo',('"' + $Repo + '"'),
  '-HunyuanRoot',('"' + $HunyuanRoot + '"')
)

$readyApi = $false
$readyBrowser = $false
$runningModel = $false
# Hunyuan3D-2.1 can require a model weight download and GPU initialization.
for ($attempt = 1; $attempt -le 24; $attempt++) {
  $readyApi = [bool](Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue)
  $readyBrowser = [bool](Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 8082 -State Listen -ErrorAction SilentlyContinue)
  if ($readyApi -and $readyBrowser) { break }
  Start-Sleep -Seconds 5
}
$runningModel = [bool](Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like 'python*.exe' -and $_.CommandLine -like '*api_server.py*' -and $_.CommandLine -like '*8081*' })
Write-Host ('Hunyuan3D API 8081: ' + $(if ($readyApi) {'LISTENING'} elseif($runningModel) {'LOADING MODEL'} else {'NOT RUNNING'}))
Write-Host ('ASCENSION browser bridge 8082: ' + $(if ($readyBrowser) {'LISTENING'} else {'NOT READY'}))
Write-Host 'Remote model queue worker is optional for local browser rendering.'
if ($readyApi -and $readyBrowser) {
  Write-Host 'ASCENSION Hunyuan connected to the local GPU; refresh the ASCENSION design page.'
  return
}
if ($runningModel -and $readyBrowser) {
  Write-Host 'Hunyuan is still loading/downloading weights. The corrected bridge is running; check the model startup log below.'
}
foreach ($name in @('hunyuan-api.err.log','hunyuan-browser.err.log','hunyuan-bridge.err.log','hunyuan-api.out.log')) {
  $log = Join-Path $logs $name
  if (Test-Path $log) {
    Write-Host ('=== ' + $name + ' (last 12 lines) ===')
    Get-Content $log -Tail 12
  }
}
if (-not $readyBrowser) {
  throw 'ASCENSION localhost browser bridge is not running. See hunyuan-browser.err.log above.'
}
if (-not $runningModel -and -not $readyApi) {
  throw 'Hunyuan3D API exited during model initialization. See hunyuan-api.err.log above.'
}
Write-Host 'Model weights are still initializing. Browser bridge is ready; revisit when API 8081 is listening.'
