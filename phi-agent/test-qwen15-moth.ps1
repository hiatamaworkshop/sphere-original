# qwen2.5:1.5b + moth + gen-003 baseline test
# Purpose: Validate species memory calibration for qwen2.5:1.5b

$env:OLLAMA_HOST = "http://localhost:11434"
$env:OLLAMA_MODEL = "qwen2.5:1.5b"
$env:SPHERE_URL = "http://localhost:3001"
$env:SPHERE_WS = "ws://localhost:3001"
$env:LOADOUT = "moth"

$query = "trending viral discussions"

Write-Host "=== qwen2.5:1.5b + moth Test ===" -ForegroundColor Cyan
Write-Host "Query: $query" -ForegroundColor Yellow
Write-Host "Baseline: gen-003 (moth: h=6.81, w=6.35, d=4.25)" -ForegroundColor Yellow
Write-Host ""

for ($i = 1; $i -le 3; $i++) {
    Write-Host "--- Session $i ---" -ForegroundColor Green
    $startTime = Get-Date
    node dist/index.js $query
    $duration = (Get-Date) - $startTime
    Write-Host "Duration: $($duration.TotalSeconds)s" -ForegroundColor Gray
    Write-Host ""
    Start-Sleep -Seconds 2
}

Write-Host "=== Test Complete ===" -ForegroundColor Cyan
Write-Host "Check phi-agent/data/eval-log.jsonl for results" -ForegroundColor Yellow
