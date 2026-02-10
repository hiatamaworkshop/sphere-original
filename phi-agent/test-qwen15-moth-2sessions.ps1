# qwen2.5:1.5b + moth: 2 sessions with reason extraction
# Purpose: Record evaluation reasons and timing

$env:OLLAMA_HOST = "http://localhost:11434"
$env:OLLAMA_MODEL = "qwen2.5:1.5b"
$env:SPHERE_URL = "http://localhost:3001"
$env:SPHERE_WS = "ws://localhost:3001"
$env:LOADOUT = "moth"

$query = "trending viral discussions"
$logFile = "test-qwen15-reasons.log"

# Clear previous log
if (Test-Path $logFile) {
    Remove-Item $logFile
}

Write-Host "=== qwen2.5:1.5b + moth (2 sessions) ===" -ForegroundColor Cyan
Write-Host "Query: $query" -ForegroundColor Yellow
Write-Host "Logging to: $logFile" -ForegroundColor Gray
Write-Host ""

$totalStart = Get-Date
$sessionTimes = @()

for ($i = 1; $i -le 2; $i++) {
    Write-Host "--- Session $i ---" -ForegroundColor Green
    $sessionStart = Get-Date

    # Run and capture output
    node dist/index.js $query 2>&1 | Tee-Object -Append -FilePath $logFile

    $sessionEnd = Get-Date
    $sessionDuration = ($sessionEnd - $sessionStart).TotalSeconds
    $sessionTimes += $sessionDuration

    Write-Host "Session $i completed: $([math]::Round($sessionDuration, 2))s" -ForegroundColor Magenta
    Write-Host ""

    Start-Sleep -Seconds 2
}

$totalEnd = Get-Date
$totalDuration = ($totalEnd - $totalStart).TotalSeconds

Write-Host "=== Timing Summary ===" -ForegroundColor Cyan
Write-Host "Session 1: $([math]::Round($sessionTimes[0], 2))s" -ForegroundColor Yellow
Write-Host "Session 2: $([math]::Round($sessionTimes[1], 2))s" -ForegroundColor Yellow
Write-Host "Total:     $([math]::Round($totalDuration, 2))s" -ForegroundColor Yellow
Write-Host "Average:   $([math]::Round(($sessionTimes | Measure-Object -Average).Average, 2))s" -ForegroundColor Yellow
Write-Host ""
Write-Host "Full log saved to: $logFile" -ForegroundColor Gray
