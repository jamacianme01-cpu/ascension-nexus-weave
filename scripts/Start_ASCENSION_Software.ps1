<#
Set up the optional ASCENSION offline browser-app executor without touching
the governed publication. Model download is opt-in (-InstallTools) and can
require several GB of local disk. No legacy publish token, no fake app result.
#>
param(
  [string]$Revision = 'main',
  [switch]$InstallTools
)
$ErrorActionPreference = 'Stop'
if ($Revision -ne 'main' -and $Revision -notmatch '^[a-fA-F0-9]{40}$') {
  throw 'Revision must be main or a 40-character GitHub commit.'
}
$root = Join-Path $env:USERPROFILE 'Projects\clarity'
if (-not (Test-Path (Join-Path $root 'ASCENSION_CORE\capabilities.py'))) {
  throw "ASCENSION runtime was not found: $root"
}
$stage = Join-Path $env:TEMP 'ascension-software-executor'
New-Item -ItemType Directory -Path $stage -Force | Out-Null
$base = "https://raw.githubusercontent.com/jamacianme01-cpu/ascension-nexus-weave/$Revision/scripts"
$installer = Join-Path $stage 'install_software_executor.py'
$module = Join-Path $stage 'ascension_software_executor.py'
Invoke-WebRequest "$base/install_software_executor.py" -OutFile $installer -UseBasicParsing -ErrorAction Stop
Invoke-WebRequest "$base/ascension_software_executor.py" -OutFile $module -UseBasicParsing -ErrorAction Stop
& python $installer --root $root --module $module --dry-run
if ($LASTEXITCODE -ne 0) { throw 'ASCENSION core compatibility test failed. Nothing installed.' }
Write-Host 'ASCENSION source compatibility: PASSED.'

if (-not (Get-Command winget -ErrorAction SilentlyContinue) -and $InstallTools) {
  throw 'Windows Package Manager (winget) is unavailable. Install Ollama and Node.js from their official installers first.'
}
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  if (-not $InstallTools) { throw 'Node.js syntax checker is missing. Re-run with -InstallTools to install it.' }
  & winget install --id OpenJS.NodeJS.LTS --exact --source winget --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { throw 'Node.js installation failed; ASCENSION core unchanged.' }
  $env:Path = "$env:Path;C:\Program Files\nodejs"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js was installed but is not available to this PowerShell session; ASCENSION core unchanged.'
}

$ollama = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
if (-not (Test-Path $ollama)) {
  $command = Get-Command ollama -ErrorAction SilentlyContinue
  if ($command) { $ollama = $command.Source }
}
if (-not (Test-Path $ollama)) {
  if (-not $InstallTools) { throw 'Ollama is missing. Re-run with -InstallTools to install it.' }
  & winget install --id Ollama.Ollama --exact --source winget --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { throw 'Ollama installation failed; ASCENSION core unchanged.' }
  $ollama = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
}
if (-not (Test-Path $ollama)) {
  throw 'The Ollama executable was not found after installation. ASCENSION core unchanged.'
}

# Do not pull models silently. Use the exact published, locally runnable 3B model.
$model = 'qwen2.5-coder:3b'
$ready = $false
try {
  $tags = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 4
  $ready = $true
} catch {
  Start-Process -FilePath $ollama -ArgumentList 'serve' -WindowStyle Hidden
  for ($i = 0; $i -lt 15 -and -not $ready; $i++) {
    Start-Sleep -Seconds 2
    try {
      $tags = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 4
      $ready = $true
    } catch { }
  }
}
if (-not $ready) { throw 'Ollama service did not start. ASCENSION core unchanged.' }

$names = @($tags.models | ForEach-Object { $_.name })
if ($names -notcontains $model) {
  if (-not $InstallTools) {
    throw "Coding model $model is missing. Re-run with -InstallTools to download it."
  }
  & $ollama pull $model
  if ($LASTEXITCODE -ne 0) { throw 'Coding model download failed. ASCENSION core unchanged.' }
}
$check = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 10
if (@($check.models | ForEach-Object { $_.name }) -notcontains $model) {
  throw 'Coding model was not confirmed in the Ollama model registry; ASCENSION core unchanged.'
}

# Do not claim old objectives or mutate publication as part of setup.
& python $installer --root $root --module $module
if ($LASTEXITCODE -ne 0) { throw 'Software executor integration failed. See the error above.' }
Write-Host 'ASCENSION offline software executor source integrated.'
Write-Host 'Your existing governed revision and pairing key were not changed.'
Write-Host 'Only browser-app source and JavaScript syntax checks are currently verified.'
