# qwen2.5:1.5b: LONGEVITY scale test (reversed decay)
# Test: moth + hermit, 1 session each

$env:OLLAMA_HOST = "http://localhost:11434"
$env:OLLAMA_MODEL = "qwen2.5:1.5b"
$env:SPHERE_URL = "http://localhost:3001"
$env:SPHERE_WS = "ws://localhost:3001"

$tests = @(
    @{Loadout="moth"; Query="trending viral discussions"},
    @{Loadout="hermit"; Query="established scientific theories"}
)

Write-Host "=== qwen2.5:1.5b LONGEVITY Scale Test ===" -ForegroundColor Cyan
Write-Host "CRITICAL CHANGE:" -ForegroundColor Yellow
Write-Host "  Step 3: LONGEVITY (not decay)" -ForegroundColor Gray
Write-Host "  Scale: 0 = ephemeral/days, 10 = timeless/permanent" -ForegroundColor Gray
Write-Host "  Backend converts: decay = 10 - longevity" -ForegroundColor Gray
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

Write-Host "=== Expected Improvements ===" -ForegroundColor Cyan
Write-Host "  ✅ 'long-lasting' → longevity=8 → d=2 (correct!)" -ForegroundColor Gray
Write-Host "  ✅ 'ephemeral' → longevity=2 → d=8 (correct!)" -ForegroundColor Gray
Write-Host "  ✅ No more 'short decay time' confusion" -ForegroundColor Gray
