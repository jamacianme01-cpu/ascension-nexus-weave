# Export only the owner's CURRENT authored engines. Never run the engines here.
# This script changes neither the source project nor a Fly deployment.
[CmdletBinding()]
param(
  [string]$ProjectRoot = 'C:\Users\Gordo\Projects\clarity',
  [string]$OutputFolder = [Environment]::GetFolderPath('Desktop')
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $ProjectRoot -ErrorAction Stop).Path
$engine = Join-Path $root 'ASCENSION_CORE'
$support = Join-Path $root 'clarity'
$required = @(
  'ASCENSION_CORE\__init__.py',
  'ASCENSION_CORE\cloud_queue_worker.py',
  'ASCENSION_CORE\objective_intake.py',
  'ASCENSION_CORE\objective_runtime.py',
  'ASCENSION_CORE\live_runtime.py',
  'ASCENSION_CORE\engine_mesh.py',
  'ASCENSION_CORE\knowledgeverse_runtime.py',
  'ASCENSION_CORE\governed_closure.py',
  'clarity\__init__.py',
  'clarity\core_runtime.py'
)
$missing = @($required | Where-Object { -not (Test-Path -LiteralPath (Join-Path $root $_) -PathType Leaf) })
if ($missing.Count) { throw ("Missing source files in CURRENT project: " + ($missing -join ', ')) }
if (-not (Test-Path -LiteralPath $OutputFolder -PathType Container)) { throw "OutputFolder does not exist" }
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$work = Join-Path $env:TEMP ('ascension-fly-source-' + [guid]::NewGuid().ToString('N'))
$destination = Join-Path $OutputFolder ("ASCENSION_CURRENT_SOURCE_$stamp.zip")
try {
  New-Item -Path $work -ItemType Directory -Force | Out-Null
  foreach ($folder in @('ASCENSION_CORE', 'clarity')) {
    $from = Join-Path $root $folder
    $to = Join-Path $work $folder
    New-Item -Path $to -ItemType Directory | Out-Null
    # Code-only export: no live user state, snapshots, caches or secrets.
    # Do not read/write anything under original source except source files.
    $files = @(Get-ChildItem -Path $from -Recurse -File -Force |
      Where-Object {
        $_.Extension -in @('.py', '.pyi') -and
        $_.FullName -notmatch '[\\/](\.git|__pycache__|_Archive|state|state_demo|generated_artifacts|intake|tokens|secrets|\.venv|venv|node_modules)[\\/]'
      })
    foreach ($file in $files) {
      $relative = $file.FullName.Substring($from.Length).TrimStart('\','/')
      $target = Join-Path $to $relative
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
      Copy-Item -LiteralPath $file.FullName -Destination $target -Force
    }
  }
  $manifest = @{
    source_root = $root
    source_kind = 'CURRENT_LOCAL_SOURCE_CODE_ONLY'
    captured_utc = (Get-Date).ToUniversalTime().ToString('o')
    live_knowledgeverse_state_included = $false
    deployment_executed = $false
    files = @()
  }
  $manifest.files = @(Get-ChildItem -Path $work -Recurse -File |
    Sort-Object FullName |
    ForEach-Object {
      $rel = $_.FullName.Substring($work.Length).TrimStart('\','/')
      @{ path = $rel.Replace('\','/'); sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
    })
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $work 'SOURCE_MANIFEST.json') -Encoding UTF8
  Compress-Archive -Path (Join-Path $work '*') -DestinationPath $destination -CompressionLevel Optimal -Force
  Write-Host "ASCENSION source packaged without changing the original: $destination"
  Write-Host "Archive SHA256: $((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash)"
  Write-Host 'No Knowledgeverse state or secrets exported. No Fly deployment attempted.'
} finally {
  if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
}
