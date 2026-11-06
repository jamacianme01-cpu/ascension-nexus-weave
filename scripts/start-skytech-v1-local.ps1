# Minimal Skytech-only V1 local run. Never changes Railway pairing, GORDONS,
# Book/Tree artwork, pathway requirements, or other ASCENSION files.
[CmdletBinding()]
param([string]$Repo='C:\Users\Gordo\Projects\ascension-nexus-weave')
$ErrorActionPreference='Stop'
$target=Join-Path $Repo 'src\components\ascension\independent-engage.tsx'
if(!(Test-Path (Join-Path $Repo 'package.json')) -or !(Test-Path $target)){
  throw "Existing Skytech ASCENSION project not found: $Repo"
}
if(Get-NetTCPConnection -LocalPort 4174 -State Listen -ErrorAction SilentlyContinue){
  throw 'The Skytech ASCENSION dev server is already open on port 4174. Press Ctrl+C in its original PowerShell window, then run this command again.'
}
$node=Get-Command node -ErrorAction Stop
$npm=Get-Command npm.cmd -ErrorAction Stop
$tags=Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 10
$model='qwen2.5-coder:3b'
if(@($tags.models | ForEach-Object {$_.name}) -notcontains $model){
  throw "Existing Ollama model $model is missing. No model downloaded or substituted."
}
# Confirm visible tokens, not an unfinished reasoning trace, before using the model.
$probe=@{
  model=$model;stream=$false;think=$false
  messages=@(@{role='user';content='Reply with exactly READY and nothing else.'})
  options=@{num_predict=80}
}|ConvertTo-Json -Depth 6
$check=Invoke-RestMethod 'http://127.0.0.1:11434/api/chat' -Method POST -ContentType 'application/json' -Body $probe -TimeoutSec 90
if($check.done_reason -eq 'length' -or [string]$check.message.content -notmatch '^\s*READY\s*[.!]?\s*$'){
  throw 'Skytech local-model sanity check did not return a completed READY. No application files changed.'
}
Write-Host ('LOCAL MODEL VERIFIED: '+$model)
# Update ONLY the local-vs-cloud async job-ID compatibility code. Preserve
# all visual/UI design; back up before changing the single component.
$src=[IO.File]::ReadAllText($target)
$already=$src.Contains('const localJob = Boolean(data.local_brain_job_id && !data.brain_job_id);') -and
  $src.Contains('(localJob ? "local_brain_job" : "brain_job")')
if(!$already){
  $oldOne='let data: Result & { error?: string; brain_job_id?: string } = await response.json();'
  $oldTwo='const jobId = data.brain_job_id;'
  $oldThree='const poll = await fetch("/api/public/ascension/independent?brain_job=" +'
  $oldFour='encodeURIComponent(jobId), { signal: controller.signal, cache: "no-store" });'
  if(!$src.Contains($oldOne) -or !$src.Contains($oldTwo) -or !$src.Contains($oldThree) -or !$src.Contains($oldFour)){
    throw 'Skytech interface source differs from the tested V1 repair. No files changed.'
  }
  $backup=$target+'.backup-'+(Get-Date -Format 'yyyyMMdd-HHmmss')
  Copy-Item -LiteralPath $target -Destination $backup -ErrorAction Stop
  $src=$src.Replace($oldOne,
    'let data: Result & { error?: string; brain_job_id?: string; local_brain_job_id?: string } = await response.json();')
  $src=$src.Replace($oldTwo,
    'const localJob = Boolean(data.local_brain_job_id && !data.brain_job_id);'+[Environment]::NewLine+'        '+
    'const jobId = data.brain_job_id || data.local_brain_job_id;')
  $src=$src.Replace($oldThree,
    'const poll = await fetch("/api/public/ascension/independent?" +'+[Environment]::NewLine+'            '+
    '(localJob ? "local_brain_job" : "brain_job") + "=" +')
  [IO.File]::WriteAllText($target,$src,[Text.UTF8Encoding]::new($false))
  Write-Host ('V1 LOCAL POLLING PATCHED; BACKUP: '+$backup)
}else{
  Write-Host 'V1 LOCAL POLLING ALREADY PATCHED'
}
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:11434/v1'
$env:LOCAL_LLM_MODEL=$model
$env:ASCENSION_REMOTE_BRAIN_ENABLED='false'
$env:ASCENSION_ALLOW_OPENAI_AI='false'
$env:ASCENSION_ALLOW_PAID_DRAFTS='false'
Write-Host 'Starting existing Skytech ASCENSION at http://127.0.0.1:4174'
Write-Host 'GORDONS worker and Railway pairing unchanged.'
Push-Location $Repo
try {
  & $npm.Source run dev:local
  if($LASTEXITCODE -ne 0){throw "Skytech ASCENSION dev server exited with code $LASTEXITCODE"}
} finally {Pop-Location}
