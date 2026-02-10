# qwen2.5:1.5b + moth: 3-step evaluation test (1 session)
# Purpose: Test sequential dimension evaluation for reason-score consistency

$env:OLLAMA_HOST = "http://localhost:11434"
$env:OLLAMA_MODEL = "qwen2.5:1.5b"
$env:SPHERE_URL = "http://localhost:3001"
$env:SPHERE_WS = "ws://localhost:3001"
$env:LOADOUT = "moth"

$query = "trending viral discussions"
$logFile = "test-qwen15-3step.log"

# Clear previous log
if (Test-Path $logFile) {
    Remove-Item $logFile
}

Write-Host "=== qwen2.5:1.5b + 3-step evaluation ===" -ForegroundColor Cyan
Write-Host "Pattern: Sequential dimension evaluation" -ForegroundColor Yellow
Write-Host "Query: $query" -ForegroundColor Yellow
Write-Host ""

$startTime = Get-Date

# Run and capture output
node dist/index.js $query 2>&1 | Tee-Object -Append -FilePath $logFile

$endTime = Get-Date
$duration = ($endTime - $startTime).TotalSeconds

Write-Host ""
Write-Host "=== Session Complete ===" -ForegroundColor Cyan
Write-Host "Duration: $([math]::Round($duration, 2))s" -ForegroundColor Yellow
Write-Host "Log saved to: $logFile" -ForegroundColor Gray
Write-Host ""
Write-Host "Checking for evaluation reasons..." -ForegroundColor Yellow

# Extract phi eval lines with reason
$content = Get-Content $logFile
$evalLines = $content | Select-String -Pattern "phi eval:"
Write-Host ""
Write-Host "=== Evaluations ===" -ForegroundColor Cyan
foreach ($line in $evalLines) {
    Write-Host $line -ForegroundColor White
}
