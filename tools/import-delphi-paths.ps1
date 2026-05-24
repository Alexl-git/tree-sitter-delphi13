# Read Delphi 13 (BDS 37.0) library and browsing paths from the registry,
# expand all macros ($(BDS), $(DXVCL), $(BDSPROJECTSDIR), etc.), filter to
# existing directories that contain Pascal source, and write them as additional
# corpus roots. Run once, then `tools/build-manifest.ps1` can read them.
#
# Usage:
#   pwsh tools/import-delphi-paths.ps1 -OutFile tools/delphi13-roots.txt
param(
  [string]$OutFile = "tools/delphi13-roots.txt"
)

$ErrorActionPreference = 'Stop'

# Macro substitutions. The BDS install root is detected from the registry's
# native key. Other macros use standard Embarcadero defaults.
$bdsRoot = (Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\Embarcadero\BDS\37.0" -ErrorAction SilentlyContinue).RootDir
if (-not $bdsRoot) { $bdsRoot = 'C:\Program Files (x86)\Embarcadero\Studio\37.0' }
$bdsRoot = $bdsRoot.TrimEnd('\')
$bdsCommon = 'C:\Users\Public\Documents\Embarcadero\Studio\37.0'

# Try to find BDSPROJECTSDIR. Most common: <USERPROFILE>\Documents\Embarcadero\Studio\37.0\Projects.
$candidates = @(
  "$env:USERPROFILE\Documents\Embarcadero\Studio\37.0\Projects",
  "E:\OneDrive\Documents\Embarcadero\Studio\37.0\Projects",
  "$env:OneDrive\Documents\Embarcadero\Studio\37.0\Projects"
)
$bdsProjects = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $bdsProjects) { $bdsProjects = $candidates[0] }

# DXVCL = DevExpress VCL install dir.
$dxvcl = 'C:\Program Files (x86)\DevExpress\VCL'

$macros = @{
  '$(BDS)'                = $bdsRoot
  '$(BDSLIB)'             = "$bdsRoot\lib"
  '$(BDSCOMMONDIR)'       = $bdsCommon
  '$(BDSPROJECTSDIR)'     = $bdsProjects
  '$(DXVCL)'              = $dxvcl
  '$(ProgramFiles(x86))'  = 'C:\Program Files (x86)'
  '$(PUBLIC)'             = 'C:\Users\Public'
  '$(LANGDIR)'            = 'en'
}

function Expand-Macros([string]$path, [string]$platform) {
  $r = $path
  foreach ($k in $macros.Keys) {
    $r = $r.Replace($k, $macros[$k])
  }
  $r = $r.Replace('$(Platform)', $platform)
  return $r
}

$allPaths = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::OrdinalIgnoreCase)

foreach ($platform in @('Win32', 'Win64')) {
  $key = "HKCU:\Software\Embarcadero\BDS\37.0\Library\$platform"
  $props = Get-ItemProperty $key -ErrorAction SilentlyContinue
  if (-not $props) {
    Write-Host "  no registry key: $key"
    continue
  }
  foreach ($field in @('Library Path', 'Search Path', 'Browsing Path')) {
    $raw = $props.$field
    if (-not $raw) { continue }
    $raw.Split(';') | ForEach-Object {
      $p = $_.Trim()
      if (-not $p) { return }
      $p = Expand-Macros $p $platform
      # Normalize to canonical case-insensitive form.
      try { $p = [System.IO.Path]::GetFullPath($p) } catch {}
      if (Test-Path $p -PathType Container) {
        # Only keep if dir contains Pascal source. -Include needs wildcard path.
        $hasPascal = $false
        try {
          foreach ($ext in @('*.pas','*.dpr','*.dpk','*.inc')) {
            if (Get-ChildItem -Path (Join-Path $p $ext) -File -ErrorAction SilentlyContinue | Select-Object -First 1) {
              $hasPascal = $true
              break
            }
          }
        } catch {}
        if ($hasPascal) { [void]$allPaths.Add($p) }
      }
    }
  }
}

# Write deduplicated, sorted output.
$dir = Split-Path -Parent $OutFile
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$sorted = $allPaths | Sort-Object -Unique
$sorted | Set-Content -Path $OutFile -Encoding UTF8

Write-Host ""
Write-Host "BDS root:        $bdsRoot"
Write-Host "BDSCOMMONDIR:    $bdsCommon"
Write-Host "BDSPROJECTSDIR:  $bdsProjects"
Write-Host "DXVCL:           $dxvcl"
Write-Host ""
Write-Host "imported $($sorted.Count) unique existing Pascal-source dirs to: $OutFile"
