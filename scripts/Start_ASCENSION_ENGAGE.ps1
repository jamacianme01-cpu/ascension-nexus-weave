<#
Run a controlled, real software-app preflight before starting the paired
ASCENSION governed objective queue worker. Nothing is claimed until preflight
produces actual code, writes it and verifies its syntax and hashes.
#>
param(
  [string]$Revision = 'main'
)
$ErrorActionPreference = 'Stop'
if ($Revision -ne 'main' -and $Revision -notmatch '^[0-9a-fA-F]{40}$') {
  throw 'Revision must be main or a pinned 40-character Git commit.'
}

$repo = Join-Path $env:USERPROFILE 'Projects\clarity'
$target = Join-Path $repo 'ASCENSION_CORE\software_project_executor.py'
if (-not (Test-Path -LiteralPath $target)) {
  throw 'Governed software executor is missing. Installation did not finish.'
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  $nodeDir = Join-Path $env:ProgramFiles 'nodejs'
  if (Test-Path (Join-Path $nodeDir 'node.exe')) {
    $env:PATH = "$nodeDir;$env:PATH"
  }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js syntax checker is unavailable. Execution queue will not start.'
}

$ollamaCommand = Get-Command ollama -ErrorAction SilentlyContinue
$ollama = if ($ollamaCommand) {
  $ollamaCommand.Source
} else {
  Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
}
if (-not (Test-Path -LiteralPath $ollama)) {
  throw 'Local Ollama executable not found. Execution queue will not start.'
}

$ready = $false
try {
  Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 5 | Out-Null
  $ready = $true
} catch {
  Start-Process -FilePath $ollama -ArgumentList 'serve' -WindowStyle Hidden
  for ($i = 0; $i -lt 12 -and -not $ready; $i++) {
    Start-Sleep -Seconds 2
    try {
      Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 4 | Out-Null
      $ready = $true
    } catch { }
  }
}
if (-not $ready) {
  throw 'Local Ollama cannot start. Execution queue will not start.'
}

$base = "https://raw.githubusercontent.com/jamacianme01-cpu/ascension-nexus-weave/$Revision/scripts"
$dir = Join-Path $env:TEMP 'ASCENSION'
New-Item -ItemType Directory -Path $dir -Force | Out-Null
$preflight = Join-Path $dir 'ascension_engage_preflight.py'
$hub = Join-Path $dir 'Start_ASCENSION_Hub.ps1'
Invoke-WebRequest "$base/ascension_engage_preflight.py" -OutFile $preflight -UseBasicParsing -ErrorAction Stop
Invoke-WebRequest "$base/Start_ASCENSION_Hub.ps1" -OutFile $hub -UseBasicParsing -ErrorAction Stop

Write-Host 'TESTING REAL APP SOURCE BEFORE CLAIMING QUEUE OBJECTIVES...'
& python -B $preflight --root $repo
if ($LASTEXITCODE -ne 0) {
  throw 'Local software executor did not produce verified source. Cloud objectives were not claimed.'
}

Write-Host 'APP SOURCE PRODUCED. Starting paired, governed execution hub.'
Write-Host 'Now open https://ascensionweave.app/live and ENGAGE one new software objective.'
Write-Host 'Leave this PowerShell window running. Ctrl+C stops the worker.'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $hub
if ($LASTEXITCODE -ne 0) {
  throw "Paired hub exited with code $LASTEXITCODE"
}
