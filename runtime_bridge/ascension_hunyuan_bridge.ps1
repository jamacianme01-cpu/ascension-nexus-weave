param(
  [string]$Repo = 'C:\Users\Gordo\Projects\ascension-nexus-weave',
  [string]$HunyuanRoot = 'C:\AI\HY3D2\Hunyuan3D2_WinPortable'
)

$ErrorActionPreference = 'Stop'
$python = Join-Path $HunyuanRoot 'python_standalone\python.exe'
$worker = Join-Path $Repo 'runtime_bridge\hunyuan_model_worker.py'
$logDir = Join-Path $Repo 'runtime_bridge\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Portable installations may use Hunyuan3D-2.1 instead of Hunyuan3D-2.
# Locate the actual API script instead of silently failing at startup.
$apiCandidates = @(
  (Join-Path $HunyuanRoot 'Hunyuan3D-2.1'),
  (Join-Path $HunyuanRoot 'Hunyuan3D-2-vanilla'),
  (Join-Path $HunyuanRoot 'Hunyuan3D-2')
)
$apiCandidates += @(Get-ChildItem -Path $HunyuanRoot -Directory -Filter 'Hunyuan3D-2*' -ErrorAction SilentlyContinue |
  Sort-Object -Property Name -Descending | Select-Object -ExpandProperty FullName)
$apiDir = $apiCandidates | Where-Object { Test-Path (Join-Path $_ 'api_server.py') } | Select-Object -First 1
if (-not (Test-Path $python) -or -not (Test-Path $worker) -or -not $apiDir) {
  $message = "Hunyuan bridge missing python, worker, or API script. Python=$python Worker=$worker Root=$HunyuanRoot"
  Add-Content -Path (Join-Path $logDir 'hunyuan-bridge.err.log') -Value "$(Get-Date -Format o) $message"
  throw $message
}

# Match the model weights to the ACTUAL API version.
# Hunyuan3D-2.1's api_server.py cannot load Hunyuan3D-2mini (2.0) weights.
# The mini weights belong to Hunyuan3D-2's API with its mini subfolder.
$apiName = Split-Path $apiDir -Leaf
if ($apiName -eq 'Hunyuan3D-2.1') {
  $modelPath = 'tencent/Hunyuan3D-2.1'
  $subfolder = 'hunyuan3d-dit-v2-1'
} else {
  $modelPath = 'tencent/Hunyuan3D-2mini'
  $subfolder = 'hunyuan3d-dit-v2-mini'
}
Write-Host ("ASCENSION Hunyuan selected API: " + $apiName)
Write-Host ("ASCENSION Hunyuan matching weights: " + $modelPath + " / " + $subfolder)
# The Windows portable distribution downloads model weights on first use when
# missing from its HuggingFaceHub cache. That is not an indication of a crash.

function Test-Hunyuan {
  return [bool](Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue)
}

function Test-HunyuanProcess {
  return [bool](Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -like 'python*.exe' -and
      $_.CommandLine -like '*api_server.py*' -and
      $_.CommandLine -like '*--port*8081*'
    })
}

function Start-Hunyuan {
  if ((Test-Hunyuan) -or (Test-HunyuanProcess)) { return }
  $env:HF_HUB_CACHE = Join-Path $HunyuanRoot 'HuggingFaceHub'
  $env:HY3DGEN_MODELS = Join-Path $HunyuanRoot 'HuggingFaceHub'
  $env:PYTORCH_CUDA_ALLOC_CONF = 'expandable_segments:True'
  Start-Process -FilePath $python -WorkingDirectory $apiDir -WindowStyle Hidden `
    -ArgumentList '-s','api_server.py','--host','127.0.0.1','--port','8081','--model_path',$modelPath,'--subfolder',$subfolder `
    -RedirectStandardOutput (Join-Path $logDir 'hunyuan-api.out.log') `
    -RedirectStandardError (Join-Path $logDir 'hunyuan-api.err.log')
}

function Test-Worker {
  return [bool](Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*runtime_bridge*hunyuan_model_worker.py*' })
}

function Start-Worker {
  if (Test-Worker) { return }
  $token = [Environment]::GetEnvironmentVariable('ASCENSION_PUBLISH_TOKEN','User')
  if ([string]::IsNullOrWhiteSpace($token)) {
    $token = [Environment]::GetEnvironmentVariable('ASCENSION_PUBLISH_TOKEN','Machine')
  }
  if ([string]::IsNullOrWhiteSpace($token)) { return }
  $env:ASCENSION_PUBLISH_TOKEN = $token
  Start-Process -FilePath $python -WorkingDirectory $Repo -WindowStyle Hidden `
    -ArgumentList '-B','-u',$worker,'--poll-seconds','3' `
    -RedirectStandardOutput (Join-Path $logDir 'hunyuan-worker.out.log') `
    -RedirectStandardError (Join-Path $logDir 'hunyuan-worker.err.log')
}

function Start-BrowserBridge {
  if ([bool](Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 8082 -State Listen -ErrorAction SilentlyContinue)) { return }
  $browser = Join-Path $Repo 'runtime_bridge\hunyuan_browser_bridge.py'
  if (-not (Test-Path $browser)) {
    Add-Content -Path (Join-Path $logDir 'hunyuan-bridge.err.log') -Value "Missing localhost Hunyuan browser bridge: $browser"
    return
  }
  Start-Process -FilePath $python -WorkingDirectory $Repo -WindowStyle Hidden `
    -ArgumentList '-B','-u',$browser `
    -RedirectStandardOutput (Join-Path $logDir 'hunyuan-browser.out.log') `
    -RedirectStandardError (Join-Path $logDir 'hunyuan-browser.err.log')
}

while ($true) {
  Start-Hunyuan
  Start-BrowserBridge
  if (Test-Hunyuan) { Start-Worker }
  Start-Sleep -Seconds 15
}
