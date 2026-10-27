param([switch]$Pair,[switch]$Once)
$ErrorActionPreference='Stop'
$repo=Join-Path $env:USERPROFILE 'Projects\clarity'
$dir=Join-Path $env:APPDATA 'ASCENSION'
$target=Join-Path $dir 'hub-key.dpapi'
New-Item -ItemType Directory -Path $dir -Force | Out-Null
if ($Pair -or -not (Test-Path $target)) {
  $secure=Read-Host 'Enter the hub pairing key from ASCENSION (hidden input)' -AsSecureString
  $secure | ConvertFrom-SecureString | Set-Content -Path $target -Encoding UTF8
}
$secureKey=Get-Content -Path $target -Raw | ConvertTo-SecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try { $env:ASCENSION_HUB_KEY=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr);$secureKey.Dispose() }
try {
  $workerDir=Join-Path $env:LOCALAPPDATA 'ASCENSION'
  New-Item -ItemType Directory -Path $workerDir -Force | Out-Null
  $worker=Join-Path $workerDir 'ascension_hub_worker.py'
  Invoke-WebRequest 'https://raw.githubusercontent.com/jamacianme01-cpu/ascension-nexus-weave/main/scripts/ascension_hub_worker.py' -OutFile $worker -UseBasicParsing -ErrorAction Stop
  if ($Once) { python -B $worker --root $repo --once }
  else { python -B $worker --root $repo }
}
finally { Remove-Item Env:\ASCENSION_HUB_KEY -ErrorAction SilentlyContinue }
