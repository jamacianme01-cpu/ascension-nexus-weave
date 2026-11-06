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
$env:ASCENSION_ALLOW_OPENAI_AI='false'
$env:ASCENSION_ALLOW_PAID_DRAFTS='false'
$env:ASCENSION_ALLOW_LOVABLE_AI='false'
$env:ASCENSION_ALLOW_PAID_IMAGES='false'
$env:PORT=[string]$Port
# Bind to the designated PC's network only. No public cloud relay or tunnel.
$env:HOST='0.0.0.0'
$env:NITRO_HOST='0.0.0.0'
$env:NITRO_PORT=[string]$Port

Write-Host ('ASCENSION BRAIN PC: ' + $env:COMPUTERNAME)
Write-Host ('LOCAL MODEL: ' + $model)
Write-Host ('OLLAMA: ' + $env:LOCAL_LLM_BASE_URL)
Write-Host ('APP PORT: ' + $Port)
Write-Host 'Cloud answer providers disabled. Existing source remains unchanged.'
Push-Location $Repo
try {
  if (!(Test-Path (Join-Path $Repo 'node_modules'))) {
    Write-Host 'Installing existing repository dependencies...'
    & npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
  }
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'ASCENSION build failed.' }
  Write-Host 'Starting local ASCENSION server. Test on this PC at http://127.0.0.1:'$Port
  & node '.output/server/index.mjs'
  if ($LASTEXITCODE -ne 0) { throw ('ASCENSION server exited with code ' + $LASTEXITCODE) }
} finally { Pop-Location }
