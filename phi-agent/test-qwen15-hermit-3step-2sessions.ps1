# qwen2.5:1.5b + hermit: 3-step evaluation (2 sessions, different queries)
# Purpose: Test consistency across different hermit-appropriate queries

$env:OLLAMA_HOST = "http://localhost:11434"
$env:OLLAMA_MODEL = "qwen2.5:1.5b"
$env:SPHERE_URL = "http://localhost:3001"
$env:SPHERE_WS = "ws://localhost:3001"
$env:LOADOUT = "hermit"

$queries = @(
    "timeless philosophical principles",
    "established scientific theories"
)

$logFile = "test-qwen15-hermit-2sessions.log"

# Clear previous log
if (Test-Path $logFile) {
    Remove-Item $logFile
}

Write-Host "=== qwen2.5:1.5b + hermit (3-step, 2 sessions) ===" -ForegroundColor Cyan
Write-Host "Loadout: hermit (weight-focused, deep walk, stability)" -ForegroundColor Yellow
Write-Host ""

$totalStart = Get-Date
$sessionTimes = @()
$allEvals = @()

for ($i = 0; $i -lt $queries.Count; $i++) {
    $sessionNum = $i + 1
    $query = $queries[$i]

    Write-Host "--- Session $sessionNum ---" -ForegroundColor Green
    Write-Host "Query: `"$query`"" -ForegroundColor Cyan
    $sessionStart = Get-Date

    # Run and capture output
    $output = node dist/index.js $query 2>&1
    $output | Tee-Object -Append -FilePath $logFile | Out-Null

    # Extract evaluations from output
    $evalLines = $output | Select-String -Pattern "phi eval:"

    Write-Host ""
    Write-Host "Evaluations:" -ForegroundColor Yellow
    foreach ($line in $evalLines) {
        Write-Host "  $line" -ForegroundColor White
        $allEvals += $line
    }

    $sessionEnd = Get-Date
    $sessionDuration = ($sessionEnd - $sessionStart).TotalSeconds
    $sessionTimes += $sessionDuration

    Write-Host "Duration: $([math]::Round($sessionDuration, 2))s" -ForegroundColor Magenta
    Write-Host ""

    Start-Sleep -Seconds 2
}

$totalEnd = Get-Date
$totalDuration = ($totalEnd - $totalStart).TotalSeconds

Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "Session 1 (`"$($queries[0])`"): $([math]::Round($sessionTimes[0], 2))s" -ForegroundColor Yellow
Write-Host "Session 2 (`"$($queries[1])`"): $([math]::Round($sessionTimes[1], 2))s" -ForegroundColor Yellow
Write-Host "Total:     $([math]::Round($totalDuration, 2))s" -ForegroundColor Yellow
Write-Host "Average:   $([math]::Round(($sessionTimes | Measure-Object -Average).Average, 2))s" -ForegroundColor Yellow
Write-Host ""
Write-Host "Total evaluations: $($allEvals.Count)" -ForegroundColor Yellow
Write-Host "Full log saved to: $logFile" -ForegroundColor Gray
