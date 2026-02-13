# Extract qwen2.5:1.5b evaluation reasons from eval-log.jsonl
param(
    [int]$Count = 15
)

$evalLog = "data/eval-log.jsonl"

if (-not (Test-Path $evalLog)) {
    Write-Error "eval-log.jsonl not found"
    exit 1
}

$lines = Get-Content $evalLog | Select-Object -Last 50

$qwenEvals = @()
$sessionNum = 0
$currentSession = $null

foreach ($line in $lines) {
    try {
        $entry = $line | ConvertFrom-Json

        if ($entry.model -eq "qwen2.5:1.5b" -and $entry.loadout -eq "moth") {
            # New session detection
            if ($entry.timestamp -and
                ($currentSession -eq $null -or
                 ([datetime]$entry.timestamp - [datetime]$currentSession).TotalMinutes -gt 1)) {
                $sessionNum++
                $currentSession = $entry.timestamp
                Write-Host "`n=== Session $sessionNum ($(([datetime]$entry.timestamp).ToString('HH:mm:ss'))) ===" -ForegroundColor Cyan
            }

            $qwenEvals += $entry

            # Extract evaluation data
            $evals = $entry.evaluations
            foreach ($eval in $evals) {
                Write-Host "`nNode: $($eval.nodeId) [$($eval.tags -join ', ')]" -ForegroundColor Yellow
                Write-Host "  h=$($eval.h) w=$($eval.w) d=$($eval.d)" -ForegroundColor Green
                Write-Host "  Reason: $($eval.reason)" -ForegroundColor White
            }
        }
    }
    catch {
        # Skip invalid JSON lines
    }
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "Total qwen2.5:1.5b moth evaluations found: $($qwenEvals.Count)" -ForegroundColor Yellow
