#!/usr/bin/env pwsh
#
# diff-harness-results.ps1 — Analyze corpus delta between Delphi-only and JS-orchestrated harness.
#
# Reads results-delphi-harness.jsonl (Delphi preprocessor, defines-only, all corpus)
#         results-orch-tolrepl.jsonl (JS orchestrated, tolerance-replace, reference)
#
# Maps by file, categorizes delta (skip/fail/error-class), and summarizes the policy decision needed.
#

param(
    [string]$DelphiHarness = "work/results-delphi-harness.jsonl",
    [string]$OrchReference = "work/results-orch-tolrepl.jsonl",
    [switch]$ShowDetails
)

function Read-JsonlFile {
    param([string]$Path)
    $path = Resolve-Path $Path -ErrorAction Stop
    $results = @{}
    $lineNo = 0
    $duplicates = 0
    foreach ($line in Get-Content $path) {
        $lineNo++
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        try {
            $obj = $line | ConvertFrom-Json -AsHashtable
            $file = $obj['file']
            if (-not $results.ContainsKey($file)) {
                $results[$file] = $obj
            } else {
                # Keep the existing entry (assume first occurrence is definitive)
                # or could merge by taking latest if there's a timestamp
                $duplicates++
            }
        } catch {
            Write-Error "Failed to parse line $lineNo : $_"
        }
    }
    if ($duplicates -gt 0) {
        Write-Host "  Note: $duplicates duplicate file entries skipped" -ForegroundColor Yellow
    }
    return $results
}

Write-Host "Reading Delphi harness results..." -ForegroundColor Cyan
$delphi = Read-JsonlFile $DelphiHarness
Write-Host "  Loaded $(($delphi.Keys | Measure-Object).Count) files" -ForegroundColor Green

Write-Host "Reading orchestrated reference results..." -ForegroundColor Cyan
$orch = Read-JsonlFile $OrchReference
Write-Host "  Loaded $(($orch.Keys | Measure-Object).Count) files" -ForegroundColor Green

# Summarize each dataset
function Summarize {
    param([hashtable]$data, [string]$label)
    $ok = ($data.Values | Where-Object { $_['ok'] -eq $true } | Measure-Object).Count
    $notOk = ($data.Values | Where-Object { $_['ok'] -ne $true } | Measure-Object).Count

    # Count files that failed due to errors vs due to missing (skip)
    $failedWithErrors = ($data.Values | Where-Object { $_['ok'] -ne $true -and $_['error_count'] -gt 0 } | Measure-Object).Count
    $failedWithoutErrors = ($data.Values | Where-Object { $_['ok'] -ne $true -and $_['error_count'] -eq 0 } | Measure-Object).Count

    $total = ($data.Keys | Measure-Object).Count

    Write-Host "$label :" -ForegroundColor Cyan
    Write-Host "  Total files: $total"
    Write-Host "  OK: $ok"
    Write-Host "  Failed (with errors): $failedWithErrors"
    Write-Host "  Skipped (missing): $failedWithoutErrors"
    Write-Host ""

    return @{
        ok = $ok
        failedWithErrors = $failedWithErrors
        skipped = $failedWithoutErrors
        total = $total
    }
}

$delphiSummary = Summarize $delphi "Delphi Harness"
$orchSummary = Summarize $orch "Orchestrated Reference"

# Analyze delta
Write-Host "DELTA ANALYSIS" -ForegroundColor Cyan
Write-Host "==============" -ForegroundColor Cyan

$okDelta = $delphiSummary.ok - $orchSummary.ok
$errorDelta = $delphiSummary.failedWithErrors - $orchSummary.failedWithErrors
$skipDelta = $delphiSummary.skipped - $orchSummary.skipped

Write-Host "OK delta: $okDelta ($(if ($okDelta -lt 0) { '+' })$([Math]::Abs($okDelta)) files worse in Delphi)"
Write-Host "Error delta: $errorDelta ($(if ($errorDelta -gt 0) { '+' })$errorDelta more files with errors in Delphi)"
Write-Host "Skip delta: $skipDelta ($(if ($skipDelta -gt 0) { '+' })$skipDelta more skipped in Delphi)"
Write-Host ""

# Categorize per-file deltas
Write-Host "PER-FILE CHANGES" -ForegroundColor Cyan
Write-Host "================" -ForegroundColor Cyan

$changesByClass = @{
    'ok_to_skip' = @()
    'ok_to_error' = @()
    'skip_to_error' = @()
    'skip_to_ok' = @()
    'error_to_ok' = @()
    'error_to_skip' = @()
    'error_count_change' = @()
}

foreach ($file in $delphi.Keys) {
    if (-not $orch.ContainsKey($file)) {
        $changesByClass['new_in_delphi'] += @($file)
        continue
    }

    $d = $delphi[$file]
    $o = $orch[$file]

    $dOk = $d['ok'] -eq $true
    $oOk = $o['ok'] -eq $true
    $dErrors = $d['error_count']
    $oErrors = $o['error_count']

    # Categorize by status transition
    if ($dOk -and -not $oOk) {
        $class = if ($o['error_count'] -gt 0) { 'ok_to_error' } else { 'ok_to_skip' }
        $changesByClass[$class] += @([PSCustomObject]@{
            File = $file
            DelphiErrors = $dErrors
            OrchErrors = $oErrors
        })
    } elseif (-not $dOk -and $oOk) {
        $class = if ($d['error_count'] -gt 0) { 'error_to_ok' } else { 'skip_to_ok' }
        $changesByClass[$class] += @([PSCustomObject]@{
            File = $file
            DelphiErrors = $dErrors
            OrchErrors = $oErrors
        })
    } elseif (-not $dOk -and -not $oOk) {
        if ($d['error_count'] -eq 0 -and $o['error_count'] -gt 0) {
            $changesByClass['skip_to_error'] += @([PSCustomObject]@{
                File = $file
                DelphiErrors = $dErrors
                OrchErrors = $oErrors
            })
        } elseif ($d['error_count'] -gt 0 -and $o['error_count'] -eq 0) {
            $changesByClass['error_to_skip'] += @([PSCustomObject]@{
                File = $file
                DelphiErrors = $dErrors
                OrchErrors = $oErrors
            })
        } elseif ($d['error_count'] -ne $o['error_count']) {
            $changesByClass['error_count_change'] += @([PSCustomObject]@{
                File = $file
                DelphiErrors = $dErrors
                OrchErrors = $oErrors
            })
        }
    }
}

# For each file in orch that's not in delphi
foreach ($file in $orch.Keys) {
    if (-not $delphi.ContainsKey($file)) {
        if (-not $changesByClass.ContainsKey('removed_in_delphi')) {
            $changesByClass['removed_in_delphi'] = @()
        }
        $changesByClass['removed_in_delphi'] += @($file)
    }
}

# Report changes
$allClasses = $changesByClass.Keys | Sort-Object

foreach ($class in $allClasses) {
    $count = ($changesByClass[$class] | Measure-Object).Count
    if ($count -gt 0) {
        $color = if ($class -match 'error_to_ok|skip_to_ok') { 'Green' } elseif ($class -match 'ok_to_error|ok_to_skip') { 'Yellow' } else { 'Cyan' }
        Write-Host "$class : $count files" -ForegroundColor $color
        if ($ShowDetails -and $count -le 50) {
            $changesByClass[$class] | ForEach-Object {
                if ($_ -is [string]) {
                    Write-Host "  $_"
                } else {
                    Write-Host "  $($_.File) (D:$($_.DelphiErrors) O:$($_.OrchErrors))"
                }
            }
        }
    }
}

Write-Host ""
Write-Host "DETAILED FILE TRANSITIONS" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan

if (($changesByClass['ok_to_error'] | Measure-Object).Count -gt 0) {
    Write-Host ""
    Write-Host "OK → ERROR (new failures in Delphi):" -ForegroundColor Yellow
    $changesByClass['ok_to_error'] | ForEach-Object {
        $file = if ($_ -is [string]) { $_ } else { $_.File }
        Write-Host "  $(Split-Path -Leaf $file)"
    }
}

if (($changesByClass['error_to_ok'] | Measure-Object).Count -gt 0) {
    Write-Host ""
    Write-Host "ERROR → OK (fixed in Delphi):" -ForegroundColor Green
    $changesByClass['error_to_ok'] | ForEach-Object {
        $file = if ($_ -is [string]) { $_ } else { $_.File }
        Write-Host "  $(Split-Path -Leaf $file)"
    }
}

Write-Host ""
Write-Host "POLICY DECISION NEEDED" -ForegroundColor Red
Write-Host "=====================" -ForegroundColor Red
Write-Host ""
Write-Host "Include-body-splice files (defines-only behavior vs expand):"
Write-Host "  Delphi uses defines-only includes (offset-identity preservation)"
Write-Host "  JS orchestration uses expand mode (includes body content)"
Write-Host ""
Write-Host "Files that transition ok→error are likely include-body-splice class:"
Write-Host "  Likely impact: Files with #include directives that expand into const/routine"
Write-Host "  bodies (EurekaLog, fibplus, Indy, Orpheus components with headers)."
Write-Host ""
Write-Host "Decision: Accept as intentional behavior (recommended) or enable expansion."
Write-Host ""
