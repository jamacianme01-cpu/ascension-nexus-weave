# Starts the existing ASCENSION V1 web server and Ollama ON THIS COMPUTER.
# Execute on the owner's designated older PC. Never uses a second computer
# for inference. No new model downloads and no paid provider fallback.
[CmdletBinding()]
param([string]$Repo = (Split-Path $PSScriptRoot -Parent), [int]$Port = 8080)
$ErrorActionPreference = 'Stop'
if (!(Test-Path (Join-Path $Repo 'package.json'))) { throw "ASCENSION repo missing: $Repo" }
if (!(Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is not installed on this computer.' }
if (!(Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm is not installed on this computer.' }

$ollamaUrl = 'http://127.0.0.1:11434/api/tags'
try {
  $tags = Invoke-RestMethod -Uri $ollamaUrl -TimeoutSec 4
} catch {
  $exe = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'),
    (Join-Path $env:ProgramFiles 'Ollama\ollama.exe')
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if (!$exe) { throw 'Ollama is not installed on the designated brain computer.' }
  Start-Process -FilePath $exe -ArgumentList 'serve' -WindowStyle Hidden
  $tags = $null
  for ($i=0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try { $tags = Invoke-RestMethod -Uri $ollamaUrl -TimeoutSec 2; break } catch {}
  }
}
if (!$tags -or !$tags.models) { throw 'Ollama is not ready or has no installed model. No new models were downloaded.' }
$available = @($tags.models | ForEach-Object { $_.name })
$preferred = @('qwen3-ascension:latest','qwen3:4b','qwen2.5-coder:14b','qwen2.5-coder:3b')
$model = $preferred | Where-Object { $available -contains $_ } | Select-Object -First 1
if (!$model) { $model = $available | Where-Object { $_ -match '^(qwen|llama|mistral|gemma|phi|deepseek)' -and $_ -notmatch 'embed' } | Select-Object -First 1 }
if (!$model) { throw 'No supported local answer model installed. No model was downloaded.' }

$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:11434/v1'
$env:LOCAL_LLM_MODEL=$model
$env:ASCENSION_REMOTE_BRAIN_ENABLED='false'
$env:ASCENSION_ALLOW_OPENAI_AI='false'
$env:ASCENSION_ALLOW_PAID_DRAFTS='false'
$env:ASCENSION_ALLOW_LOVABLE_AI='false'
$env:ASCENSION_ALLOW_PAID_IMAGES='false'
$env:PORT=[string]$Port
# Bind ONLY to this PC. Railway reaches it through the outbound worker,
# never through a direct inbound LAN or public network listener.
$env:HOST='127.0.0.1'
$env:NITRO_HOST='127.0.0.1'
$env:NITRO_PORT=[string]$Port

Write-Host ('ASCENSION BRAIN PC: ' + $env:COMPUTERNAME)
Write-Host ('LOCAL MODEL: ' + $model)
Write-Host ('OLLAMA: ' + $env:LOCAL_LLM_BASE_URL)
Write-Host ('APP PORT: ' + $Port)
Write-Host 'Cloud answer providers disabled. Existing source remains unchanged.'
# 3D is also assigned to this same PC. Never fall back to another device.
$hunyuanRoot='C:\AI\HY3D2\Hunyuan3D2_WinPortable'
$hunyuanLaunch=Join-Path $Repo 'runtime_bridge\start_hunyuan_now.ps1'
if ((Test-Path (Join-Path $hunyuanRoot 'python_standalone\python.exe')) -and
    (Test-Path $hunyuanLaunch)) {
  try {
    & $hunyuanLaunch -Repo $Repo -HunyuanRoot $hunyuanRoot
  } catch {
    Write-Warning ('LOCAL 3D NOT READY: ' + $_.Exception.Message)
  }
} else {
  Write-Host 'LOCAL 3D NOT INSTALLED ON THIS BRAIN PC. No second computer will be used.'
}
Push-Location $Repo
try {
  if (!(Test-Path (Join-Path $Repo 'node_modules'))) {
    Write-Host 'Installing existing repository dependencies...'
    if (Get-Command bun -ErrorAction SilentlyContinue) { & bun install --frozen-lockfile }
    else { & npm install --no-package-lock }
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
  }
  if (Get-Command bun -ErrorAction SilentlyContinue) { & bun run build }
  else { & npm run build }
  if ($LASTEXITCODE -ne 0) { throw 'ASCENSION build failed.' }
  # Start server on THIS machine; the worker connects OUTBOUND to Railway.
  # No other PC is assigned any intelligence role.
  $localServer='http://127.0.0.1:' + $Port + '/api/public/ascension/independent'
  $logs=Join-Path $env:LOCALAPPDATA 'ASCENSION\\BrainLogs'
  New-Item -ItemType Directory -Force -Path $logs | Out-Null
  $stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
  $serverOut=Join-Path $logs ("brain-server-$stamp.out.log")
  $serverErr=Join-Path $logs ("brain-server-$stamp.err.log")
  $exists=[bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  if (!$exists) {
    Start-Process -FilePath (Get-Command node).Source -ArgumentList '.output/server/index.mjs' -WorkingDirectory $Repo -WindowStyle Hidden -RedirectStandardOutput $serverOut -RedirectStandardError $serverErr | Out-Null
  }
  $ready=$false
  for($i=0;$i -lt 36;$i++){
    try {
      $response=Invoke-RestMethod -Uri $localServer -TimeoutSec 3
      if($response.providers.Local -eq $true -and $response.brain_mode -eq 'same-computer') { $ready=$true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  if (!$ready) {
    if (Test-Path $serverErr) { Get-Content $serverErr -Tail 15 }
    throw 'ASCENSION V1 server did not verify the local PC Ollama engine.'
  }
  Write-Host ('LOCAL ASCENSION BRAIN READY: http://127.0.0.1:' + $Port)
  $pair=[Environment]::GetEnvironmentVariable('ASCENSION_REMOTE_BRAIN_KEY','User')
  if (!$pair) { $pair=$env:ASCENSION_REMOTE_BRAIN_KEY }
  if (!$pair -or $pair.Length -lt 48) {
    Write-Host 'CLOUD CONNECTION NOT PAIRED. Local ASCENSION is running; no hosted inference substituted.'
    return
  }
  $env:ASCENSION_REMOTE_BRAIN_KEY=$pair
  Write-Host 'Connecting the Railway interface OUTBOUND to this same computer...'
  & node 'scripts/brain-worker.mjs'
  if ($LASTEXITCODE -ne 0) { throw ('Outbound brain worker exited with code ' + $LASTEXITCODE) }
} finally { Pop-Location }
