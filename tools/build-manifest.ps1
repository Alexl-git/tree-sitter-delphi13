# Build a Delphi-13-CURATED corpus manifest.
#
# This is a focused subset — we want files that the modern Delphi 13 compiler
# accepts. FPC code, Lazarus, Borland Turbo Vision era stuff is excluded.
#
# Usage:
#   pwsh tools/build-manifest.ps1 -OutFile work/manifest.txt
param(
  [string]$OutFile = "work/manifest.txt"
)

$ErrorActionPreference = 'Stop'

# Modern Delphi 13 codebases (user's own + Embarcadero + curated third-party).
$roots = @(
  # User projects (modern Delphi 13)
  'C:\Projects\DB\ORM3',
  'C:\Projects\TableTools',
  'C:\Projects\Loader2019',
  'C:\Projects\YADF',
  'C:\Projects\Micronite',
  'C:\Projects\MMSRV',
  'C:\Projects\MMMicronite',

  # Embarcadero RAD Studio 13 sources
  'C:\Program Files (x86)\Embarcadero\Studio\37.0\source',

  # Modern third-party (Delphi-targeting)
  'C:\Program Files (x86)\DevExpress\VCL',
  'C:\Projects\spring4d',
  'C:\Projects\dsharp',
  'C:\Projects\mvvm-in-delphi',
  'C:\Projects\Delphi_Mocks',
  'C:\Projects\Virtual-TreeView',
  'C:\Projects\RADStudio12Demos',
  'C:\Projects\Indy',
  'C:\Projects\FireDAC',
  'C:\Projects\DUnitX',
  'C:\Projects\OmniThreadLibrary',
  'C:\Projects\jcf-pascal-format',
  'C:\Projects\pasfmt-rad',

  # Modern Raize / Konopka (Delphi-only since CS5)
  'C:\Program Files (x86)\Raize\CS5\Source\Delphi',

  # EurekaLog (Delphi-only error reporting)
  'C:\Program Files (x86)\Neos Eureka S.r.l\EurekaLog 7\Source',

  # AsyncPro — user actively uses it for COM port handling.
  'C:\Projects\AsyncPro',
  # Orpheus — user still uses; gradually migrating to DevExpress.
  'C:\Projects\Orpheus',

  # DEMOSDIR — Delphi samples directory (very useful test corpus).
  'C:\Users\Public\Documents\Embarcadero\Studio\37.0\Samples'

  # NOTE: Intentionally excluded — FPC / Borland-era / non-Delphi-13:
  #   C:\Projects\JCL              (heavy FPC support)
  #   C:\Projects\JEDI / JVCL      (Delphi 7 era + FPC archives)
  #   C:\Projects\Orpheus / AsyncPro / SysTools  (Turbo Vision era)
  #   C:\Projects\FastMM4          (old, but still useful — debatable)
  #   C:\Projects\fibplus*         (older FB access layer, lots of legacy)
  #   C:\Projects\Loader2018       (succeeded by Loader2019)
  #   C:\Projects\BACKUP_ALL       (duplicate of other roots)
)

# Additionally pull any roots imported from Delphi 13's registry-defined
# library/browsing paths (run `tools/import-delphi-paths.ps1` to regenerate).
$registryRootsFile = Join-Path (Split-Path -Parent $PSCommandPath) 'delphi13-roots.txt'
if (Test-Path $registryRootsFile) {
  Get-Content $registryRootsFile | ForEach-Object {
    $p = $_.Trim()
    if ($p) { $roots += $p }
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
