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
    -ArgumentList '-s','api_server.py','--host','127.0.0.1','--port','8081','--model_path','tencent/Hunyuan3D-2mini' `
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

while ($true) {
  Start-Hunyuan
  if (Test-Hunyuan) { Start-Worker }
  Start-Sleep -Seconds 15
}
