# Existing ASCENSION / CLARITY owner-computer runtime. No Fly, no old PC.
# Run from the original web repo; original core and state stay in their owner folder.
param([string]$OriginalRoot = $env:ASCENSION_ORIGINAL_ROOT)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:COMPUTERNAME -eq 'GORDONS') {
  throw 'The retired GORDONS computer must not be used for this deployment.'
}

$webRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Test-OriginalRoot([string]$Candidate) {
  if (-not $Candidate -or -not (Test-Path -LiteralPath $Candidate -PathType Container)) { return $false }
  foreach ($relative in @(
    'ASCENSION_CORE\cloud_queue_worker.py',
    'ASCENSION_CORE\live_publication.py',
    'clarity\core_runtime.py',
    'ASCENSION_CORE\state\live\published\governed_state.json'
  )) {
    if (-not (Test-Path -LiteralPath (Join-Path $Candidate $relative) -PathType Leaf)) { return $false }
  }
  return $true
}

if ($PSBoundParameters.ContainsKey('OriginalRoot')) {
  if (-not (Test-OriginalRoot $OriginalRoot)) {
    throw "The explicitly selected original root is incomplete: $OriginalRoot. No substitute core will be created."
  }
} elseif (-not (Test-OriginalRoot $OriginalRoot)) {
  # Look only in current local working locations; never restore an archive or
  # retired OneDrive checkout. Refuse ambiguous matches rather than guessing.
  $locations = @((Join-Path $HOME 'Projects'), (Split-Path -Parent $webRoot))
  $candidates = @()
  foreach ($location in ($locations | Select-Object -Unique)) {
    if (Test-Path -LiteralPath $location -PathType Container) {
      $candidates += $location
      $candidates += @(Get-ChildItem -LiteralPath $location -Directory -ErrorAction SilentlyContinue |
        Where-Object { -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -and $_.Name -notmatch '(?i)archive|backup|retired|onedrive' } |
        Select-Object -ExpandProperty FullName)
    }
  }
  $matchesFound = @($candidates | Where-Object {
    $_ -notmatch '(?i)(^|[\\/])OneDrive[^\\/]*([\\/]|$)' -and (Test-OriginalRoot $_)
  } | ForEach-Object { (Resolve-Path -LiteralPath $_).Path } | Sort-Object -Unique)
  if ($matchesFound.Count -ne 1) {
    if ($matchesFound.Count -gt 1) {
      throw ("Multiple original runtime folders found; choose the existing owner root explicitly: " + ($matchesFound -join '; '))
    }
    throw 'No complete original ASCENSION/CLARITY root found in the local project folders. No substitute core or state will be created.'
  }
  $OriginalRoot = $matchesFound[0]
}
$OriginalRoot = (Resolve-Path -LiteralPath $OriginalRoot).Path
Write-Host "ASCENSION original runtime: $OriginalRoot"
$core = Join-Path $OriginalRoot 'ASCENSION_CORE'
$live = Join-Path $core 'state\live'
$required = @(
  (Join-Path $core 'cloud_queue_worker.py'),
  (Join-Path $core 'live_publication.py'),
  (Join-Path $OriginalRoot 'clarity\core_runtime.py'),
  (Join-Path $live 'published\governed_state.json'),
  (Join-Path $webRoot 'scripts\ascension-owner-queue\ascension-volume-transport.py'),
  (Join-Path $webRoot 'package.json')
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

# On a clean checkout, install from the existing manifest. npm ci fails when
# the committed lockfile is stale; npm install reconciles it locally.
if (-not (Test-Path -LiteralPath (Join-Path $webRoot 'node_modules\vite\bin\vite.js') -PathType Leaf)) {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) { throw 'npm is required to install the existing ASCENSION web dependencies.' }
  Push-Location $webRoot
  try {
    & $npm.Source install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'ASCENSION dependency installation failed.' }
  } finally { Pop-Location }
}
if (-not (Test-Path -LiteralPath (Join-Path $webRoot 'node_modules\vite\bin\vite.js') -PathType Leaf)) {
  throw 'ASCENSION Vite dependency is still missing after installation.'
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

  # A healthy transport alone is not evidence that the original engine
  # worker has imported its runtime and reached the authenticated queue.
  $workerConnected = $false
  for ($attempt = 0; $attempt -lt 45; $attempt++) {
    if ($worker.HasExited) {
      throw "Original ASCENSION worker exited before polling (exit code $($worker.ExitCode))."
    }
    try {
      $health = Invoke-RestMethod -Uri 'http://127.0.0.1:9091/health' -Method Get -TimeoutSec 2 -Headers @{
        'x-ascension-publish-token' = $env:ASCENSION_PUBLISH_TOKEN
      }
      if ($health.worker_poll_seen -eq $true -and $health.worker_recently_polling -eq $true) {
        $workerConnected = $true
        break
      }
    } catch {
      # Wait for the actual authenticated worker poll, not a process launch.
    }
    Start-Sleep -Seconds 1
  }
  if (-not $workerConnected) {
    throw 'Original ASCENSION engine worker did not reach its authenticated queue. Inspect the original worker output; no substitute runtime has been started.'
  }
  Write-Host 'ASCENSION ORIGINAL WORKER CONNECTED TO LOCAL QUEUE'
  Write-Host 'Objective execution and result delivery still require a real verified run.'
  Write-Host 'Open http://127.0.0.1:4174/'
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
