$notOkCount = 0
$okCount = 0
$lineNum = 0

foreach ($line in Get-Content work/results-delphi-harness.jsonl) {
    $lineNum++
    if ($lineNum -gt 20000) { break }

    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $obj = $line | ConvertFrom-Json -AsHashtable
    if ($obj['ok'] -eq $true) { $okCount++ }
    else { $notOkCount++ }
}

Write-Host "OK: $okCount, NOT-OK: $notOkCount, Total: $($okCount + $notOkCount)"

# Also check error_count distribution
$errorSum = 0
$missingSum = 0
$okCount2 = 0
$lineNum = 0

foreach ($line in Get-Content work/results-delphi-harness.jsonl) {
    $lineNum++
    if ($lineNum -gt 20000) { break }

    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $obj = $line | ConvertFrom-Json -AsHashtable
    $errorSum += $obj['error_count']
    $missingSum += $obj['missing_count']
    if ($obj['ok'] -eq $true) { $okCount2++ }
}

Write-Host "OK (field): $okCount2"
Write-Host "Sum of error_count: $errorSum"
Write-Host "Sum of missing_count: $missingSum"
