# gemma2:2b: moth + hermit test (1 session each)
# Purpose: Validate speed and measurement with species memory (gen-003)

$env:OLLAMA_HOST = "http://localhost:11434"
$env:OLLAMA_MODEL = "gemma2:2b"
$env:SPHERE_URL = "http://localhost:3001"
$env:SPHERE_WS = "ws://localhost:3001"

$tests = @(
    @{Loadout="moth"; Query="trending viral discussions"},
    @{Loadout="hermit"; Query="established scientific theories"}
)

Write-Host "=== gemma2:2b + Species Memory (gen-003) ===" -ForegroundColor Cyan
Write-Host "Testing: moth + hermit (1 session each)" -ForegroundColor Yellow
Write-Host "Expected: Fast execution + accurate measurement" -ForegroundColor Yellow
Write-Host ""

$allTimes = @()

foreach ($test in $tests) {
    $env:LOADOUT = $test.Loadout
    $query = $test.Query

    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "Test: $($test.Loadout)" -ForegroundColor Green
    Write-Host "Query: `"$query`"" -ForegroundColor Yellow
    Write-Host ""

    $startTime = Get-Date
    $output = node dist/index.js $query 2>&1
    $duration = ((Get-Date) - $startTime).TotalSeconds

    # Extract evaluations
    $evalLines = $output | Select-String -Pattern "phi eval:"

    Write-Host "Evaluations ($($evalLines.Count)):" -ForegroundColor Yellow
    foreach ($line in $evalLines) {
        Write-Host "  $line" -ForegroundColor White
    }

    Write-Host ""
    Write-Host "Duration: $([math]::Round($duration, 2))s" -ForegroundColor Magenta
    $allTimes += $duration
    Write-Host ""

    Start-Sleep -Seconds 2
}

Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "moth:   $([math]::Round($allTimes[0], 2))s" -ForegroundColor Yellow
Write-Host "hermit: $([math]::Round($allTimes[1], 2))s" -ForegroundColor Yellow
Write-Host "Average: $([math]::Round(($allTimes | Measure-Object -Average).Average, 2))s" -ForegroundColor Yellow
Write-Host ""
Write-Host "Note: gemma2:2b uses word examples + 2-step analysis pattern" -ForegroundColor Gray
