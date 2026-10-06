param(
  [string]$Repo = 'C:\Users\Gordo\Projects\ascension-nexus-weave',
  [string]$HunyuanRoot = 'C:\AI\HY3D2\Hunyuan3D2_WinPortable'
)

$ErrorActionPreference = 'SilentlyContinue'
$python = Join-Path $HunyuanRoot 'python_standalone\python.exe'
$apiDir = Join-Path $HunyuanRoot 'Hunyuan3D-2'
$apiScript = Join-Path $apiDir 'api_server.py'
$worker = Join-Path $Repo 'runtime_bridge\hunyuan_model_worker.py'
$logDir = Join-Path $Repo 'runtime_bridge\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

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
