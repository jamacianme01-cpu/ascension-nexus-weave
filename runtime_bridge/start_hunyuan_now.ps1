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
# Recover only the ASCENSION browser bridge. Do not stop the GPU API (8081).
$browserScript = Join-Path $Repo 'runtime_bridge\hunyuan_browser_bridge.py'
if (-not (Test-Path $browserScript)) { throw "Missing localhost browser bridge: $browserScript" }
New-Item -ItemType Directory -Force -Path $logs | Out-Null

function Browser-Listening {
  return [bool](Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 8082 -State Listen -ErrorAction SilentlyContinue)
}

function Get-BridgeManagers {
  @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -in @('powershell.exe','pwsh.exe') -and
      $_.CommandLine -like '*-File*ascension_hunyuan_bridge.ps1*'
    })
}

if (-not (Browser-Listening)) {
  # Stop ONLY the background supervisor, leaving the running Hunyuan GPU
  # api_server.py untouched. This prevents another 8082 process spawning
  # while we clean up the existing broken instances.
  $managers = @(Get-BridgeManagers)
  foreach ($item in $managers) {
    Write-Host ('Pausing stale browser supervisor PID ' + $item.ProcessId)
    Stop-Process -Id $item.ProcessId -Force -ErrorAction SilentlyContinue
  }

  # These processes have the exact browser bridge script in their command
  # lines. They are not the Hunyuan GPU model, worker or other Python apps.
  $stale = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -like 'python*.exe' -and
      $_.CommandLine -like '*hunyuan_browser_bridge.py*'
    })
  if ($stale.Count -gt 0) {
    Write-Host ('Clearing ' + $stale.Count + ' stalled ASCENSION browser-bridge processes on port 8082.')
    foreach ($item in $stale) {
      Stop-Process -Id $item.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
  }

  if (-not (Browser-Listening)) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $browserOut = Join-Path $logs ("hunyuan-browser-$stamp.out.log")
    $browserErr = Join-Path $logs ("hunyuan-browser-$stamp.err.log")
    # -S skips loading third-party site packages from Hunyuan's portable
    # Python environment. The bridge needs only Python's standard library.
    $launch = @{
      FilePath = $python
      WorkingDirectory = $Repo
      WindowStyle = 'Hidden'
      PassThru = $true
      ArgumentList = @('-S','-B','-u',('"' + $browserScript + '"'))
      RedirectStandardOutput = $browserOut
      RedirectStandardError = $browserErr
    }
    Write-Host 'Starting a single clean localhost browser bridge on 127.0.0.1:8082...'
    try { $instance = Start-Process @launch }
    catch { throw ('Browser bridge process failed to launch: ' + $_.Exception.Message) }

    $connected = $false
    for ($attempt = 1; $attempt -le 50; $attempt++) {
      if (Browser-Listening) { $connected = $true; break }
      Start-Sleep -Milliseconds 300
      $instance.Refresh()
      if ($instance.HasExited) { break }
    }
    if (-not $connected) {
      $instance.Refresh()
      Write-Host ('Browser process PID: ' + $instance.Id + ', exited: ' + $instance.HasExited)
      if (Test-Path $browserErr) {
        Write-Host '=== Browser bridge stderr ==='
        Get-Content $browserErr -Tail 30
      }
      if (Test-Path $browserOut) {
        Write-Host '=== Browser bridge stdout ==='
        Get-Content $browserOut -Tail 12
      }
      throw 'Browser adapter cannot bind 8082; exact diagnostic output shown above.'
    }
  }
}

# Start the updated manager only after establishing the browser bridge,
# so the supervisor cannot spawn 11 competing Python processes again.
$managers = @(Get-BridgeManagers)
if ($managers.Count -eq 0) {
  $managerArgs = @(
    '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',
    '-File',('"' + $bridge + '"'),'-Repo',('"' + $Repo + '"'),
    '-HunyuanRoot',('"' + $HunyuanRoot + '"')
  )
  Write-Host 'Starting Hunyuan supervisor; preserving any loading model on 8081.'
  Start-Process -FilePath powershell.exe -WindowStyle Hidden -WorkingDirectory $Repo -ArgumentList $managerArgs
}

$readyBrowser = Browser-Listening
$readyApi = [bool](Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue)
$runningModel = [bool](Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -like 'python*.exe' -and
    $_.CommandLine -like '*api_server.py*' -and
    $_.CommandLine -like '*8081*'
  })
Write-Host ('ASCENSION browser bridge 8082: ' + $(if ($readyBrowser) {'LISTENING'} else {'NOT READY'}))
Write-Host ('Hunyuan API 8081: ' + $(if ($readyApi) {'LISTENING'} elseif ($runningModel) {'LOADING MODEL'} else {'NOT RUNNING'}))
Write-Host 'Remote queue worker is not required for direct local browser use.'

if (-not $readyBrowser) {
  throw 'ASCENSION local browser bridge did not start.'
}
if ($readyApi) {
  Write-Host 'Hunyuan API and browser bridge are listening. The local connection is ready for verification.'
} elseif ($runningModel) {
  Write-Host 'Browser bridge repaired. Hunyuan is still loading its model; it has NOT been restarted.'
  $apiLog = Join-Path $logs 'hunyuan-api.err.log'
  if (Test-Path $apiLog) { Get-Content $apiLog -Tail 8 }
} else {
  $apiLog = Join-Path $logs 'hunyuan-api.err.log'
  if (Test-Path $apiLog) { Get-Content $apiLog -Tail 15 }
  throw 'Port 8082 is repaired, but Hunyuan GPU API 8081 is not running.'
}
