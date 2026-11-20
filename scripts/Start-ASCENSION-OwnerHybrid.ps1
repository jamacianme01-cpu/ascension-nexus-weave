# Existing ASCENSION / CLARITY owner-computer runtime. No Fly, no old PC.
# Run from the original web repo; original core and state stay in their owner folder.
param([string]$OriginalRoot = $env:ASCENSION_ORIGINAL_ROOT)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:COMPUTERNAME -eq 'GORDONS') {
  throw 'The retired GORDONS computer must not be used for this deployment.'
}

$webRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $OriginalRoot) {
  $OriginalRoot = Join-Path $HOME 'Projects\clarity'
}
if (-not (Test-Path -LiteralPath $OriginalRoot -PathType Container)) {
  throw "Original ASCENSION/CLARITY source was not found at $OriginalRoot. No substitute core will be created."
}
$OriginalRoot = (Resolve-Path -LiteralPath $OriginalRoot).Path
$core = Join-Path $OriginalRoot 'ASCENSION_CORE'
$live = Join-Path $core 'state\live'
$required = @(
  (Join-Path $core 'cloud_queue_worker.py'),
  (Join-Path $core 'live_publication.py'),
  (Join-Path $OriginalRoot 'clarity\core_runtime.py'),
  (Join-Path $live 'published\governed_state.json'),
  (Join-Path $webRoot 'scripts\ascension-owner-queue\ascension-volume-transport.py'),
  (Join-Path $webRoot 'node_modules\vite\bin\vite.js')
)
foreach ($requiredFile in $required) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Existing ASCENSION runtime prerequisite missing: $requiredFile. No new runtime or state will be substituted."
  }
}
$python = Get-Command python.exe -ErrorAction SilentlyContinue
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $python -or -not $node) {
  throw 'Python and Node.js are required to run the existing owner source. No remote model or platform will be substituted.'
}

if (-not $env:ASCENSION_PUBLISH_TOKEN) {
  # An ephemeral local-only publish key. Never print or save credentials.
  $bytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $env:ASCENSION_PUBLISH_TOKEN = [Convert]::ToBase64String($bytes)
}
$env:ASCENSION_VOLUME_TRANSPORT_URL = 'http://127.0.0.1:9091'
$env:ASCENSION_ENABLE_PAID_APIS = 'false'
$env:ASCENSION_ALLOW_OPENAI_AI = 'false'
$env:PYTHONPATH = if ($env:PYTHONPATH) { "$OriginalRoot;$($env:PYTHONPATH)" } else { $OriginalRoot }
$transportScript = Join-Path $webRoot 'scripts\ascension-owner-queue\ascension-volume-transport.py'
$transportDir = Join-Path $OriginalRoot '.ascension_owner_transport'
$queueUrl = 'http://127.0.0.1:4174/api/public/ascension/execution-queue'

$started = @()
try {
  $transport = Start-Process -FilePath $python.Source -WorkingDirectory $OriginalRoot -NoNewWindow -PassThru -ArgumentList @(
    '-u', "`"$transportScript`"", '--live-root', "`"$live`"",
    '--transport-root', "`"$transportDir`"", '--host', '127.0.0.1', '--port', '9091'
  )
  $started += $transport

  $web = Start-Process -FilePath $node.Source -WorkingDirectory $webRoot -NoNewWindow -PassThru -ArgumentList @(
    'node_modules/vite/bin/vite.js', '--host', '127.0.0.1',
    '--port', '4174', '--strictPort'
  )
  $started += $web

  $connected = $false
  for ($attempt = 0; $attempt -lt 25; $attempt++) {
    if ($transport.HasExited -or $web.HasExited) {
      throw 'An existing ASCENSION process stopped during startup.'
    }
    try {
      $health = Invoke-RestMethod -Uri 'http://127.0.0.1:9091/health' -Method Get -TimeoutSec 2 -Headers @{
        'x-ascension-publish-token' = $env:ASCENSION_PUBLISH_TOKEN
      }
      if ($health.status -eq 'LIVE_GOVERNED_TRANSPORT') {
        $readiness = Invoke-RestMethod -Uri 'http://127.0.0.1:4174/api/public/ascension/answer-readiness' -Method Get -TimeoutSec 3
        if ($readiness.owner_queue_transport_connected -eq $true) {
          $connected = $true
          break
        }
      }
    } catch {
      # The original runtime or website may still be starting.
    }
    Start-Sleep -Seconds 1
  }
  if (-not $connected) { throw 'The original ASCENSION local queue transport and website did not establish a verified connection.' }
  $worker = Start-Process -FilePath $python.Source -WorkingDirectory $OriginalRoot -NoNewWindow -PassThru -ArgumentList @(
    '-u', '-m', 'ASCENSION_CORE.cloud_queue_worker', '--root', "`"$live`"",
    '--queue-url', $queueUrl, '--runner', 'owner-local'
  )
  $started += $worker

  Write-Host 'ASCENSION ORIGINAL OWNER-COMPUTER QUEUE CONNECTED'
  Write-Host 'Open http://127.0.0.1:4174/'
  Write-Host 'Oracle Cloud has not been paired by this local test.'
  while ($true) {
    foreach ($child in $started) {
      if ($child.HasExited) { throw "ASCENSION process exited unexpectedly (PID $($child.Id))." }
    }
    Start-Sleep -Seconds 3
  }
} finally {
  foreach ($child in $started) {
    if ($child -and -not $child.HasExited) {
      Stop-Process -Id $child.Id -ErrorAction SilentlyContinue
    }
  }
}
