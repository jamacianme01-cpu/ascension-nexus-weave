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
# Set-Content appends CRLF; never pass that whitespace to ConvertTo-SecureString.
# Trim the stored DPAPI ciphertext, without changing or reissuing the secret.
$cipherText=(Get-Content -Path $target -Raw -ErrorAction Stop).Trim()
if (-not $cipherText) { throw 'The saved hub key file is empty. Re-run with -Pair to save your existing key.' }
try {
  $secureKey=ConvertTo-SecureString -String $cipherText -ErrorAction Stop
} catch {
  throw 'The saved hub key could not be decrypted by this Windows account. Re-run with -Pair to save your existing key.'
}
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try { $env:ASCENSION_HUB_KEY=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr);$secureKey.Dispose() }
if ($env:ASCENSION_HUB_KEY -cnotmatch '^[a-fA-F0-9]{96}
try {
  $workerDir=Join-Path $env:LOCALAPPDATA 'ASCENSION'
  New-Item -ItemType Directory -Path $workerDir -Force | Out-Null
  $worker=Join-Path $workerDir 'ascension_hub_worker.py'
  Invoke-WebRequest 'https://raw.githubusercontent.com/jamacianme01-cpu/ascension-nexus-weave/main/scripts/ascension_hub_worker.py' -OutFile $worker -UseBasicParsing -ErrorAction Stop
  if ($Once) { python -B $worker --root $repo --once }
  else { python -B $worker --root $repo }
}
finally { Remove-Item Env:\ASCENSION_HUB_KEY -ErrorAction SilentlyContinue }
) {
  Remove-Item Env:\ASCENSION_HUB_KEY -ErrorAction SilentlyContinue
  throw 'The saved hub key is not a valid 48-byte pairing key. Re-run with -Pair to save your existing key.'
}
try {
  $workerDir=Join-Path $env:LOCALAPPDATA 'ASCENSION'
  New-Item -ItemType Directory -Path $workerDir -Force | Out-Null
  $worker=Join-Path $workerDir 'ascension_hub_worker.py'
  Invoke-WebRequest 'https://raw.githubusercontent.com/jamacianme01-cpu/ascension-nexus-weave/main/scripts/ascension_hub_worker.py' -OutFile $worker -UseBasicParsing -ErrorAction Stop
  if ($Once) { python -B $worker --root $repo --once }
  else { python -B $worker --root $repo }
}
finally { Remove-Item Env:\ASCENSION_HUB_KEY -ErrorAction SilentlyContinue }
