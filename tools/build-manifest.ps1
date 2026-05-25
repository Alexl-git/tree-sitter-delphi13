# Build a Delphi-13-CURATED corpus manifest.
#
# This is a focused subset — we want files that the modern Delphi 13 compiler
# accepts. FPC code, Lazarus, Borland Turbo Vision era stuff is excluded.
#
# Roots are read from tools/corpus-roots.txt (one path per line, # for comments).
# A starter file is provided — edit it to point at your own Delphi 13 sources.
#
# Usage:
#   pwsh tools/build-manifest.ps1 -OutFile work/manifest.txt
param(
  [string]$OutFile = "work/manifest.txt",
  [string]$RootsFile = ""
)

$ErrorActionPreference = 'Stop'

# Resolve roots file (default: tools/corpus-roots.txt next to this script).
if (-not $RootsFile) {
  $RootsFile = Join-Path (Split-Path -Parent $PSCommandPath) 'corpus-roots.txt'
}

$roots = @()
if (Test-Path $RootsFile) {
  $roots = Get-Content $RootsFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#')) { $line }
  }
} else {
  Write-Host "  no roots file at $RootsFile — using empty manifest"
}

# Additionally pull any roots imported from Delphi's registry-defined
# library/browsing paths (run `tools/import-delphi-paths.ps1` to regenerate).
$registryRootsFile = Join-Path (Split-Path -Parent $PSCommandPath) 'delphi13-roots.txt'
if (Test-Path $registryRootsFile) {
  Get-Content $registryRootsFile | ForEach-Object {
    $p = $_.Trim()
    if ($p -and -not $p.StartsWith('#')) { $roots += $p }
  }
}
$roots = $roots | Sort-Object -Unique

$excludePatterns = @(
  '\\tree-sitter-pascal\\',
  '\\tree-sitter-delphi13\\',
  '\\tree-sitter-DFM\\',
  '\\node_modules\\',
  '\\\.git\\',
  '\\\.hg\\',
  '\\Win32\\Debug\\',
  '\\Win32\\Release\\',
  '\\Win64\\Debug\\',
  '\\Win64\\Release\\',
  '\\__history\\',
  '\\__recovery\\',
  '\\Backup\\',
  '\\_BACKUP\\',
  '\\OLD\\'
)

$dir = Split-Path -Parent $OutFile
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

$writer = New-Object System.IO.StreamWriter($OutFile, $false, [System.Text.Encoding]::UTF8)
$count = 0
$skipped = 0

foreach ($r in $roots) {
  if (-not (Test-Path $r)) {
    Write-Host "  MISSING root: $r"
    continue
  }
  Write-Host "  scanning: $r"
  Get-ChildItem $r -Recurse -File -Include *.pas,*.dpr,*.dpk,*.inc -ErrorAction SilentlyContinue | ForEach-Object {
    $p = $_.FullName
    $skip = $false
    foreach ($pat in $excludePatterns) {
      if ($p -match $pat) { $skip = $true; break }
    }
    if ($skip) { $skipped++ } else {
      $writer.WriteLine($p)
      $count++
    }
  }
}
$writer.Close()

Write-Host ""
Write-Host "manifest: $OutFile"
Write-Host "  included: $count"
Write-Host "  excluded: $skipped"
