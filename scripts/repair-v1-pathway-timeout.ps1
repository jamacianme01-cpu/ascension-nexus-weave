# ASCENSION V1 targeted pathways timeout repair for the designated GORDONS PC.
# No Git, no repo replacement, no Hunyuan restart, no unapproved UI changes.
[CmdletBinding()]
param([string]$Repo=(Join-Path $env:USERPROFILE 'Projects\ascension-brain-runtime'))
$ErrorActionPreference='Stop'
if($env:COMPUTERNAME -ne 'GORDONS'){throw 'This repair is restricted to the designated older ASCENSION computer (GORDONS).'}
if(!(Test-Path (Join-Path $Repo 'package.json'))){throw "ASCENSION runtime not found: $Repo"}
if(!(Get-Command node -ErrorAction SilentlyContinue) -or !(Get-Command npm.cmd -ErrorAction SilentlyContinue)){
  throw 'The existing Node and npm installation is not available.'
}
$key=$env:ASCENSION_REMOTE_BRAIN_KEY
if(!$key){$key=[Environment]::GetEnvironmentVariable('ASCENSION_REMOTE_BRAIN_KEY','User')}
if(!$key -or $key.Length -lt 48){throw 'Run this from the same PowerShell window as the previously paired ASCENSION brain worker.'}
$ollama=Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 8
$models=@($ollama.models | ForEach-Object {$_.name})
$model=@('qwen3-ascension:latest','qwen3:4b','qwen2.5-coder:14b','qwen2.5-coder:3b') |
  Where-Object {$models -contains $_} | Select-Object -First 1
if(!$model){throw 'A supported installed Ollama model is not available. No paid provider will be used.'}
$before=Invoke-RestMethod 'http://127.0.0.1:8080/api/public/ascension/independent' -TimeoutSec 8
if($before.brain_mode -ne 'same-computer' -or !$before.local_brain_configured){
  throw 'The currently running ASCENSION server is not the authorized local-brain instance.'
}
$root='https://raw.githubusercontent.com/jamacianme01-cpu/ascension-nexus-weave/repair/v1-pathway-entry-20261029/'
$paths=@(
 'src/lib/ascension/brain-relay.server.ts',
 'src/lib/ascension/engine/local-answer.server.ts',
 'src/routes/api/public/ascension/independent.ts',
 'src/components/ascension/independent-engage.tsx',
 'scripts/brain-worker.mjs'
)
$expect=@('enqueueBrowserBrainJob','480_000','450000','brain_job_id','505_000')
$tmp=Join-Path $env:TEMP ('ascension-pathways-repair-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force|Out-Null
Write-Host 'Downloading the five targeted source files. Existing ASCENSION runtime remains in place.'
for($i=0;$i -lt $paths.Count;$i++){
  $rel=$paths[$i];$dest=Join-Path $tmp ($rel -replace '/','\')
  New-Item -ItemType Directory -Path (Split-Path $dest) -Force|Out-Null
  Invoke-WebRequest -UseBasicParsing -Uri ($root+$rel) -OutFile $dest -TimeoutSec 45
  if(!(Select-String -LiteralPath $dest -SimpleMatch -Quiet $expect[$i])){
    throw ('The downloaded repair failed a source version check: '+$rel)
  }
}
$backup=Join-Path $Repo ('.ascension-repair-backup\'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
foreach($rel in $paths){
  $original=Join-Path $Repo ($rel -replace '/','\')
  if(!(Test-Path $original)){throw ('Missing expected original source: '+$original)}
  $save=Join-Path $backup ($rel -replace '/','\')
  New-Item -ItemType Directory -Path (Split-Path $save) -Force|Out-Null
  Copy-Item -LiteralPath $original -Destination $save
}
foreach($rel in $paths){
  $original=Join-Path $Repo ($rel -replace '/','\')
  $next=Join-Path $tmp ($rel -replace '/','\')
  Copy-Item -LiteralPath $next -Destination $original -Force
}
Write-Host ('Original five files backed up to '+$backup)
Push-Location $Repo
try {
  Write-Host 'Building repaired ASCENSION V1 pathways (Tree and Book unchanged).'
  & npm.cmd run build
  if($LASTEXITCODE -ne 0){throw 'Build failed. The old versions remain backed up; the live server was not stopped.'}
} finally {Pop-Location}
$port=Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if(!$port){throw 'The existing ASCENSION server exited during the build.'}
$existing=Get-CimInstance Win32_Process -Filter ('ProcessId='+$port.OwningProcess)
if($existing.Name -ne 'node.exe' -or $existing.CommandLine -notmatch '\.output[\\/]server[\\/]index\.mjs'){
  throw ('Refusing to stop an unrecognized process on port 8080. PID '+$port.OwningProcess)
}
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:11434/v1'
$env:LOCAL_LLM_MODEL=$model
$env:ASCENSION_ALLOW_OPENAI_AI='false'
$env:ASCENSION_REMOTE_BRAIN_ENABLED='false'
$env:PORT='8080';$env:NITRO_PORT='8080'
$env:HOST='127.0.0.1';$env:NITRO_HOST='127.0.0.1'
$env:ASCENSION_REMOTE_BRAIN_KEY=$key
Stop-Process -Id $port.OwningProcess -Force
Start-Sleep -Seconds 1
$logs=Join-Path $env:LOCALAPPDATA 'ASCENSION\BrainLogs'
New-Item -ItemType Directory -Path $logs -Force|Out-Null
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
Start-Process -FilePath (Get-Command node).Source -ArgumentList '.output/server/index.mjs' -WorkingDirectory $Repo -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs ("pathways-$stamp.out.log")) -RedirectStandardError (Join-Path $logs ("pathways-$stamp.err.log")) | Out-Null
$ready=$false
for($i=0;$i -lt 50;$i++){
  Start-Sleep -Milliseconds 300
  try{
    $check=Invoke-RestMethod 'http://127.0.0.1:8080/api/public/ascension/independent' -TimeoutSec 3
    if($check.local_brain_configured -eq $true -and $check.brain_mode -eq 'same-computer'){$ready=$true;break}
  }catch{}
}
if(!$ready){throw 'New local ASCENSION server did not pass the readiness check; inspect BrainLogs.'}
Write-Host ('ASCENSION local brain updated on '+$env:COMPUTERNAME+' using '+$model)
Write-Host 'Starting the paired outbound worker; keep this PowerShell window open.'
Push-Location $Repo
try{& node '.\scripts\brain-worker.mjs'}finally{Pop-Location}
