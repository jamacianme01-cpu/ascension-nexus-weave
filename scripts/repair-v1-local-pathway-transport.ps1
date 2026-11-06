# Targeted old-PC pathway transport repair. Does not change the approved V1 UI.
[CmdletBinding()]
param([string]$Repo=(Join-Path $env:USERPROFILE 'Projects\ascension-brain-runtime'))
$ErrorActionPreference = 'Stop'
if($env:COMPUTERNAME -ne 'GORDONS'){throw 'Run this only on the designated GORDONS computer.'}
if(!(Test-Path (Join-Path $Repo 'package.json'))){throw "Missing ASCENSION runtime folder: $Repo"}
$key=$env:ASCENSION_REMOTE_BRAIN_KEY
if(!$key){$key=[Environment]::GetEnvironmentVariable('ASCENSION_REMOTE_BRAIN_KEY','User')}
if(!$key -or $key.Length -lt 48){throw 'ASCENSION pairing key missing from this PowerShell session. Existing worker will not be disturbed.'}
$exe=(Get-Command node -ErrorAction Stop).Source
$npm=(Get-Command npm.cmd -ErrorAction Stop).Source
$ollamaCmd=(Get-Command ollama -ErrorAction Stop).Source
$ollamaReady=$false
for($i=0;$i -lt 20;$i++){
  try{$tags=Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3;$ollamaReady=$true;break}
  catch{
    if($i -eq 0){Start-Process -FilePath $ollamaCmd -ArgumentList 'serve' -WindowStyle Hidden}
    Start-Sleep -Milliseconds 750
  }
}
if(!$ollamaReady){throw 'Ollama could not be started on GORDONS; no files changed.'}
$models=@($tags.models|ForEach-Object {$_.name})
$model=@('qwen3-ascension:latest','qwen3:4b','qwen2.5-coder:14b','qwen2.5-coder:3b')|
  Where-Object {$models -contains $_}|Select-Object -First 1
if(!$model){throw 'No previously installed ASCENSION-compatible local model is available.'}
$files=@(
 'src/lib/ascension/engine/local-answer.server.ts',
 'src/routes/api/public/ascension/independent.ts',
 'scripts/brain-worker.mjs'
)
$markers=@('Ollama returned no pathway response stream','cpu-pathways-streamed-polling-v2','local_brain_job')
$base='https://raw.githubusercontent.com/jamacianme01-cpu/ascension-nexus-weave/repair/v1-pathway-entry-20261029/'
$tmp=Join-Path $env:TEMP ('ascension-transport-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force|Out-Null
Write-Host 'Checking the targeted local pathway transport files...'
for($i=0;$i -lt $files.Count;$i++){
  $rel=$files[$i]
  $download=Join-Path $tmp ($rel -replace '/','\')
  New-Item -ItemType Directory -Path (Split-Path $download) -Force|Out-Null
  Invoke-WebRequest -UseBasicParsing -Uri ($base+$rel) -OutFile $download -TimeoutSec 50
  if(!(Select-String -LiteralPath $download -Pattern $markers[$i] -SimpleMatch -Quiet)){
    throw ('Downloaded source did not match the verified transport repair: '+$rel)
  }
  if(!(Test-Path (Join-Path $Repo ($rel -replace '/','\')))){
    throw ('Cannot repair missing ASCENSION file: '+$rel)
  }
}
$backup=Join-Path $Repo ('.ascension-repair-backup\transport-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
foreach($rel in $files){
  $dest=Join-Path $Repo ($rel -replace '/','\')
  $save=Join-Path $backup ($rel -replace '/','\')
  New-Item -ItemType Directory -Path (Split-Path $save) -Force|Out-Null
  Copy-Item -LiteralPath $dest -Destination $save
  Copy-Item -LiteralPath (Join-Path $tmp ($rel -replace '/','\')) -Destination $dest -Force
}
Write-Host ('Backup created: '+$backup)
Push-Location $Repo
try{
  Write-Host 'Compiling the updated local pathway transport...'
  & $npm run build
  if($LASTEXITCODE -ne 0){throw 'ASCENSION compilation failed; existing running processes remain untouched.'}
}finally{Pop-Location}
$port=Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue|Select-Object -First 1
if($port){
  $owner=Get-CimInstance Win32_Process -Filter ('ProcessId='+$port.OwningProcess)
  if($owner.Name -ne 'node.exe' -or $owner.CommandLine -notmatch '\.output[\\/]server[\\/]index\.mjs'){
    throw ('Port 8080 is occupied by an unrelated program (PID '+$port.OwningProcess+'). No process was stopped.')
  }
}
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:11434/v1'
$env:LOCAL_LLM_MODEL=$model
$env:ASCENSION_REMOTE_BRAIN_ENABLED='false'
$env:ASCENSION_ALLOW_OPENAI_AI='false'
$env:ASCENSION_ALLOW_PAID_DRAFTS='false'
$env:PORT='8080';$env:NITRO_PORT='8080'
$env:HOST='127.0.0.1';$env:NITRO_HOST='127.0.0.1'
$env:ASCENSION_REMOTE_BRAIN_KEY=$key
$workers=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object {$_.CommandLine -match 'brain-worker\.mjs'})
foreach($worker in $workers){
  Write-Host ('Stopping outdated local ASCENSION worker PID '+$worker.ProcessId)
  Stop-Process -Id $worker.ProcessId -Force
}
if($port){Stop-Process -Id $port.OwningProcess -Force}
Start-Sleep -Seconds 1
$logs=Join-Path $env:LOCALAPPDATA 'ASCENSION\BrainLogs'
New-Item -ItemType Directory -Path $logs -Force|Out-Null
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$serverErr=Join-Path $logs ("transport-server-$stamp.err.log")
$workerErr=Join-Path $logs ("transport-worker-$stamp.err.log")
Start-Process -FilePath $exe -ArgumentList '.output/server/index.mjs' -WorkingDirectory $Repo -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs ("transport-server-$stamp.out.log")) -RedirectStandardError $serverErr | Out-Null
$ready=$false
for($i=0;$i -lt 45;$i++){
  try{
    $local=Invoke-RestMethod 'http://127.0.0.1:8080/api/public/ascension/independent' -TimeoutSec 3
    if($local.local_brain_configured -eq $true -and $local.local_build_signature -eq 'cpu-pathways-streamed-polling-v2'){$ready=$true;break}
  }catch{}
  Start-Sleep -Milliseconds 500
}
if(!$ready){
  if(Test-Path $serverErr){Get-Content $serverErr -Tail 12}
  throw 'The repaired ASCENSION local server did not pass its runtime version check.'
}
Write-Host ('LOCAL SERVER VERIFIED: '+$local.local_build_signature+' | '+$model)
Start-Process -FilePath $exe -ArgumentList 'scripts/brain-worker.mjs' -WorkingDirectory $Repo -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs ("transport-worker-$stamp.out.log")) -RedirectStandardError $workerErr|Out-Null
$online=$false
for($i=0;$i -lt 24;$i++){
  Start-Sleep -Milliseconds 700
  try{
    $remote=Invoke-RestMethod 'https://ascension-nexus-weave-production.up.railway.app/api/public/ascension/independent' -TimeoutSec 4
    if($remote.brain_connected -eq $true){$online=$true;break}
  }catch{}
}
if(!$online){
  if(Test-Path $workerErr){Get-Content $workerErr -Tail 12}
  throw 'Local brain updated, but the website has not verified the new worker connection.'
}
Write-Host 'WEBSITE CONNECTED: True'
Write-Host 'Local streamed pathway polling installed; full four-pathway generation remains to be tested.'
