# qwen2.5:1.5b: Enhanced v2 (PAUSE + concrete role)
# Test: moth + hermit, 1 session each

$env:OLLAMA_HOST = "http://localhost:11434"
$env:OLLAMA_MODEL = "qwen2.5:1.5b"
$env:SPHERE_URL = "http://localhost:3001"
$env:SPHERE_WS = "ws://localhost:3001"

$tests = @(
    @{Loadout="moth"; Query="trending viral discussions"},
    @{Loadout="hermit"; Query="timeless philosophical principles"}
)

Write-Host "=== qwen2.5:1.5b Enhanced v2 ===" -ForegroundColor Cyan
Write-Host "Improvements:" -ForegroundColor Yellow
Write-Host "  1. PAUSE between dimensions" -ForegroundColor Gray
Write-Host "  2. Concrete role descriptions (not abstract)" -ForegroundColor Gray
Write-Host "  3. Agent's perspective for each dimension" -ForegroundColor Gray
Write-Host ""

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
    Write-Host ""
}

Write-Host "=== Test Complete ===" -ForegroundColor Cyan
Write-Host "Check for:" -ForegroundColor Yellow
Write-Host "  - Improved reason-score consistency" -ForegroundColor Gray
Write-Host "  - Complete decay explanations" -ForegroundColor Gray
Write-Host "  - Reduced contradictions" -ForegroundColor Gray
