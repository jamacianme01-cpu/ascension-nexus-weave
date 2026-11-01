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
# Preserve the working or loading Hunyuan GPU process. Only start a missing manager.
$existing = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -in @('powershell.exe','pwsh.exe') -and $_.CommandLine -like '*-File*ascension_hunyuan_bridge.ps1*' })
if ($existing.Count -eq 0) {
  Write-Host 'Starting Hunyuan manager without resetting existing GPU processes...'
  $managerArgs = @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',
    '-File',('"' + $bridge + '"'),'-Repo',('"' + $Repo + '"'),
    '-HunyuanRoot',('"' + $HunyuanRoot + '"'))
  Start-Process -FilePath powershell.exe -WorkingDirectory $Repo -WindowStyle Hidden -ArgumentList $managerArgs
} else {
  Write-Host 'Hunyuan manager already running; preserving model initialization.'
}

# Recover the browser adapter independently if its port is not listening.
$browserScript = Join-Path $Repo 'runtime_bridge\hunyuan_browser_bridge.py'
if (-not (Test-Path $browserScript)) { throw "Missing Hunyuan browser bridge: $browserScript" }
New-Item -ItemType Directory -Force -Path $logs | Out-Null
function Browser-Listening {
  return [bool](Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 8082 -State Listen -ErrorAction SilentlyContinue)
}
if (-not (Browser-Listening)) {
  $browserProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'python*.exe' -and $_.CommandLine -like '*hunyuan_browser_bridge.py*' })
  if ($browserProcesses.Count -eq 0) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $browserOut = Join-Path $logs ("hunyuan-browser-$stamp.out.log")
    $browserErr = Join-Path $logs ("hunyuan-browser-$stamp.err.log")
    Write-Host 'Starting local browser bridge directly, without touching Hunyuan 8081...'
    $startArgs = @{
      FilePath = $python
      WorkingDirectory = $Repo
      WindowStyle = 'Hidden'
      PassThru = $true
      ArgumentList = @('-B','-u',('"' + $browserScript + '"'))
      RedirectStandardOutput = $browserOut
      RedirectStandardError = $browserErr
    }
    try { $launched = Start-Process @startArgs }
    catch { throw ('Browser process launch failed: ' + $_.Exception.Message) }
    $connected = $false
    for ($attempt = 1; $attempt -le 15; $attempt++) {
      if (Browser-Listening) { $connected = $true; break }
      Start-Sleep -Milliseconds 400
      $launched.Refresh()
      if ($launched.HasExited) { break }
    }
    if (-not $connected) {
      Write-Host ('Browser bridge process exited: ' + $launched.HasExited)
      if (Test-Path $browserErr) {
        Write-Host '=== Browser startup error ==='
        Get-Content $browserErr -Tail 25
      }
      if (Test-Path $browserOut) {
        Write-Host '=== Browser startup output ==='
        Get-Content $browserOut -Tail 10
      }
      throw 'Browser bridge failed to listen on 8082. Diagnostic logs printed above.'
    }
  } else {
    Write-Host ('Browser bridge process exists but not ready: PID ' + ($browserProcesses.ProcessId -join ','))
  }
}
$readyBrowser = Browser-Listening
$readyApi = [bool](Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue)
$runningModel = [bool](Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like 'python*.exe' -and $_.CommandLine -like '*api_server.py*' -and $_.CommandLine -like '*8081*' })
Write-Host ('ASCENSION browser bridge 8082: ' + $(if ($readyBrowser) {'LISTENING'} else {'NOT READY'}))
Write-Host ('Hunyuan API 8081: ' + $(if ($readyApi) {'LISTENING'} elseif ($runningModel) {'LOADING MODEL'} else {'NOT RUNNING'}))
Write-Host 'Remote queue worker is optional for local browser use.'
if (-not $readyBrowser) { throw 'Local browser bridge is not listening. See browser logs.' }
if ($readyApi) {
  Write-Host 'Both Hunyuan ports are listening.'
} elseif ($runningModel) {
  Write-Host 'Browser bridge is connected; Hunyuan weights are still loading. Preserve the model process.'
  $apiLog = Join-Path $logs 'hunyuan-api.err.log'
  if (Test-Path $apiLog) { Get-Content $apiLog -Tail 7 }
} else {
  $apiLog = Join-Path $logs 'hunyuan-api.err.log'
  if (Test-Path $apiLog) { Get-Content $apiLog -Tail 15 }
  throw 'Hunyuan API 8081 is not running. Review Hunyuan model startup log.'
}
