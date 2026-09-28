$ErrorActionPreference = 'Stop'
$runtimeRepo = 'C:\Users\Gordo\Projects\clarity'
$core = Join-Path $runtimeRepo 'ASCENSION_CORE'
if (!(Test-Path (Join-Path $core 'cloud_queue_worker.py'))) { throw "ASCENSION runtime was not found at $core" }

$token = [Environment]::GetEnvironmentVariable('ASCENSION_PUBLISH_TOKEN','User')
if ([string]::IsNullOrWhiteSpace($token)) { $token = [Environment]::GetEnvironmentVariable('ASCENSION_PUBLISH_TOKEN','Machine') }
if ([string]::IsNullOrWhiteSpace($token)) { throw 'ASCENSION_PUBLISH_TOKEN must be saved in the User or Machine environment so the worker can restart after sign-in.' }

$ollama = Get-Command 'ollama' -ErrorAction SilentlyContinue
if (!$ollama) {
    $ollama = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'),
        (Join-Path $env:ProgramFiles 'Ollama\ollama.exe')
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (!$ollama) { throw 'Ollama is not installed or is not on PATH. The local answer model must be installed to answer without API charges.' }
$ollamaPath = if ($ollama -is [string]) { $ollama } else { $ollama.Source }
try {
    $response = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 8
} catch {
    Start-Process -FilePath $ollamaPath -ArgumentList 'serve' -WindowStyle Hidden
    $response = $null
    for ($i = 0; $i -lt 12 -and !$response; $i++) {
        Start-Sleep -Seconds 2
        try { $response = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 4 } catch { }
    }
    if (!$response) { throw 'Ollama did not start. The answer worker needs a running local model.' }
}
$names = @($response.models | ForEach-Object { $_.name })
$model = @('qwen3:4b','qwen3-ascension','qwen3-ascension:latest') | Where-Object { $names -contains $_ } | Select-Object -First 1
if (!$model) { $model = $names | Where-Object { $_ -match '^(qwen|llama|gemma|mistral|phi|deepseek)' -and $_ -notmatch 'embed' } | Select-Object -First 1 }
if (!$model) { throw ('A local answer model is needed. Installed models: ' + ($names -join ', ')) }

Copy-Item (Join-Path $PSScriptRoot 'local_answer.py') (Join-Path $core 'local_answer.py') -Force
Copy-Item (Join-Path $PSScriptRoot 'local_queue_worker.py') (Join-Path $core 'local_queue_worker.py') -Force

Set-Location $runtimeRepo
$env:LOCAL_LLM_BASE_URL = 'http://127.0.0.1:11434/v1'
$env:LOCAL_LLM_MODEL = $model
& python -B -c "from ASCENSION_CORE.local_answer import generate_local_draft; d = generate_local_draft('Why do leaves change color in autumn?'); assert d['kind'] == 'answer' and len(d['body']) >= 80; print('Local answer check passed: ' + d['body'][:180])"
if ($LASTEXITCODE -ne 0) { throw 'The installed local model did not produce an answer. The worker was not started.' }

$runner = Join-Path $runtimeRepo 'run_ascension_answer_worker.ps1'
$runnerText = @'
$ErrorActionPreference = 'Stop'
$runtimeRepo = 'C:\Users\Gordo\Projects\clarity'
$token = [Environment]::GetEnvironmentVariable('ASCENSION_PUBLISH_TOKEN','User')
if ([string]::IsNullOrWhiteSpace($token)) { $token = [Environment]::GetEnvironmentVariable('ASCENSION_PUBLISH_TOKEN','Machine') }
if ([string]::IsNullOrWhiteSpace($token)) { throw 'ASCENSION_PUBLISH_TOKEN is missing' }
$env:ASCENSION_PUBLISH_TOKEN = $token
$env:LOCAL_LLM_BASE_URL = 'http://127.0.0.1:11434/v1'
$env:LOCAL_LLM_MODEL = '__MODEL__'
$ollamaPath = '__OLLAMA__'
Set-Location $runtimeRepo
$logDir = Join-Path $runtimeRepo 'ASCENSION_CORE\state\live\logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$tries = 0
while ($true) {
    try { Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 4 | Out-Null; break } catch {
        if ($tries % 6 -eq 0) {
            Start-Process -FilePath $ollamaPath -ArgumentList 'serve' -WindowStyle Hidden
        }
        $tries++
        Start-Sleep -Seconds 5
    }
}
while ($true) {
    try {
        & python -B -u -m ASCENSION_CORE.local_queue_worker --root (Join-Path $runtimeRepo 'ASCENSION_CORE\state\live') --queue-url 'https://ascensionweave.app/api/public/ascension/execution-queue' 2>&1 | Out-File -FilePath (Join-Path $logDir 'local_answer_worker.log') -Append
    } catch {
        $_ | Out-File -FilePath (Join-Path $logDir 'local_answer_worker.log') -Append
    }
    Start-Sleep -Seconds 5
}
'@
$runnerText = $runnerText.Replace('__MODEL__', $model)
$runnerText = $runnerText.Replace('__OLLAMA__', $ollamaPath)
Set-Content -Path $runner -Value $runnerText -Encoding UTF8

# The worker starts for this Windows account at sign-in and stays running.
$startup = [Environment]::GetFolderPath('Startup')
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startup 'ASCENSION Answer Worker.lnk'))
$shortcut.TargetPath = (Join-Path $PSHOME 'powershell.exe')
$shortcut.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $runner + '"'
$shortcut.WorkingDirectory = $runtimeRepo
$shortcut.Save()

Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" | Where-Object {
    $_.CommandLine -like '*ASCENSION_CORE.local_queue_worker*' -or $_.CommandLine -like '*ASCENSION_CORE.cloud_queue_worker*'
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $shortcut.Arguments -WorkingDirectory $runtimeRepo -WindowStyle Hidden
Start-Sleep -Seconds 3
$workerProcess = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" | Where-Object { $_.CommandLine -like '*ASCENSION_CORE.local_queue_worker*' }
if (!$workerProcess) { throw "The worker did not stay up. Check $runtimeRepo\ASCENSION_CORE\state\live\logs\local_answer_worker.log" }
Write-Host "ASCENSION local answer worker started with $model. It will restart when you sign in."
Write-Host "Live answers require this PC and the local model to stay on."
