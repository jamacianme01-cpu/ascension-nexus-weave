$ErrorActionPreference = 'Stop'
$runtimeRepo = 'C:\Users\Gordo\Projects\clarity'
$core = Join-Path $runtimeRepo 'ASCENSION_CORE'
if (!(Test-Path (Join-Path $core 'cloud_queue_worker.py'))) { throw "ASCENSION runtime was not found at $core" }

$token = [Environment]::GetEnvironmentVariable('ASCENSION_PUBLISH_TOKEN','User')
if ([string]::IsNullOrWhiteSpace($token)) { $token = [Environment]::GetEnvironmentVariable('ASCENSION_PUBLISH_TOKEN','Machine') }
if ([string]::IsNullOrWhiteSpace($token)) { throw 'ASCENSION_PUBLISH_TOKEN must be saved in the User or Machine environment so the worker can restart after sign-in.' }

try {
    $response = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 8
} catch {
    throw 'The local answer model is not running at 127.0.0.1:11434. ASCENSION cannot answer without a local model or paid API.'
}
$names = @($response.models | ForEach-Object { $_.name })
$model = @('qwen3:4b','qwen3-ascension','qwen3-ascension:latest') | Where-Object { $names -contains $_ } | Select-Object -First 1
if (!$model) { $model = $names | Where-Object { $_ -match '^(qwen|llama|gemma|mistral|phi|deepseek)' -and $_ -notmatch 'embed' } | Select-Object -First 1 }
if (!$model) { throw ('A local answer model is needed. Installed models: ' + ($names -join ', ')) }

Copy-Item (Join-Path $PSScriptRoot 'local_answer.py') (Join-Path $core 'local_answer.py') -Force
Copy-Item (Join-Path $PSScriptRoot 'local_queue_worker.py') (Join-Path $core 'local_queue_worker.py') -Force

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
Set-Location $runtimeRepo
$logDir = Join-Path $runtimeRepo 'ASCENSION_CORE\state\live\logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
while ($true) {
    & python -B -u -m ASCENSION_CORE.local_queue_worker --root (Join-Path $runtimeRepo 'ASCENSION_CORE\state\live') --queue-url 'https://ascensionweave.app/api/public/ascension/execution-queue' 2>&1 | Out-File -FilePath (Join-Path $logDir 'local_answer_worker.log') -Append
    Start-Sleep -Seconds 5
}
'@
$runnerText = $runnerText.Replace('__MODEL__', $model)
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
