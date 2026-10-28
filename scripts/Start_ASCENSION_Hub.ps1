param([switch]$Pair,[switch]$Once,[switch]$ObservationsOnly,[string]$VersionRequestId)
$ErrorActionPreference = 'Stop'
$repo = Join-Path $env:USERPROFILE 'Projects\clarity'
$dir = Join-Path $env:APPDATA 'ASCENSION'
$target = Join-Path $dir 'hub-key.dpapi'
New-Item -ItemType Directory -Path $dir -Force | Out-Null

if ($Pair -or -not (Test-Path -LiteralPath $target)) {
  $secure = Read-Host 'Enter the hub pairing key from ASCENSION (hidden input)' -AsSecureString
  try {
    $cipher = ConvertFrom-SecureString -SecureString $secure
    Set-Content -LiteralPath $target -Value $cipher -Encoding UTF8
  } finally {
    $secure.Dispose()
  }
}

# Set-Content adds a newline. ConvertTo-SecureString requires only DPAPI ciphertext.
$cipherText = (Get-Content -LiteralPath $target -Raw -ErrorAction Stop).Trim()
if (-not $cipherText) {
  throw 'The saved hub key file is empty. Re-run with -Pair to save your existing key.'
}
try {
  $secureKey = ConvertTo-SecureString -String $cipherText -ErrorAction Stop
} catch {
  throw 'The saved hub key could not be decrypted by this Windows account. Re-run with -Pair to save your existing key.'
}

$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
  $env:ASCENSION_HUB_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  $secureKey.Dispose()
}
if ($env:ASCENSION_HUB_KEY -cnotmatch '^[a-fA-F0-9]{96}$') {
  Remove-Item Env:\ASCENSION_HUB_KEY -ErrorAction SilentlyContinue
  throw 'The saved hub key is not a valid 48-byte pairing key. Re-run with -Pair to save your existing key.'
}

try {
  $workerDir = Join-Path $env:LOCALAPPDATA 'ASCENSION'
  New-Item -ItemType Directory -Path $workerDir -Force | Out-Null
  $worker = Join-Path $workerDir 'ascension_hub_worker.py'
  $versions = Join-Path $workerDir 'ascension_version_worker.py'
  $baseUrl = 'https://raw.githubusercontent.com/jamacianme01-cpu/ascension-nexus-weave/main/scripts/'
  Invoke-WebRequest ($baseUrl + 'ascension_hub_worker.py') -OutFile $worker -UseBasicParsing -ErrorAction Stop
  Invoke-WebRequest ($baseUrl + 'ascension_version_worker.py') -OutFile $versions -UseBasicParsing -ErrorAction Stop
  if ($VersionRequestId) {
    if ($VersionRequestId -notmatch '^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}
  if ($Once) { $hubArgs += '--once' }
  if ($ObservationsOnly) { $hubArgs += '--observations-only' }
  python -B @hubArgs
} finally {
  Remove-Item Env:\ASCENSION_HUB_KEY -ErrorAction SilentlyContinue
}
) {
      throw 'VersionRequestId must be a UUID.'
    }
    python -B $versions --root $repo --request-id $VersionRequestId
    if ($LASTEXITCODE -ne 0) { throw 'Version backfill failed. See the output above.' }
    return
  }
  $hubArgs = @($worker, '--root', $repo)
  if ($Once) { $hubArgs += '--once' }
  if ($ObservationsOnly) { $hubArgs += '--observations-only' }
  python -B @hubArgs
} finally {
  Remove-Item Env:\ASCENSION_HUB_KEY -ErrorAction SilentlyContinue
}
