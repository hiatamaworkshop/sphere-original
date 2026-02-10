# qwen2.5:1.5b + hermit: 3-step evaluation test (1 session)
# Purpose: Test 3-step pattern with different loadout and query

$env:OLLAMA_HOST = "http://localhost:11434"
$env:OLLAMA_MODEL = "qwen2.5:1.5b"
$env:SPHERE_URL = "http://localhost:3001"
$env:SPHERE_WS = "ws://localhost:3001"
$env:LOADOUT = "hermit"

$query = "fundamental mathematical concepts"
$logFile = "test-qwen15-hermit-3step.log"

# Clear previous log
if (Test-Path $logFile) {
    Remove-Item $logFile
}

Write-Host "=== qwen2.5:1.5b + hermit (3-step) ===" -ForegroundColor Cyan
Write-Host "Pattern: Sequential dimension evaluation" -ForegroundColor Yellow
Write-Host "Query: $query" -ForegroundColor Yellow
Write-Host "Loadout: hermit (weight-focused, deep walk)" -ForegroundColor Yellow
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

Write-Host ""
Write-Host "=== Analysis ===" -ForegroundColor Cyan
Write-Host "Hermit characteristics:" -ForegroundColor Yellow
Write-Host "- Prefers high-weight (dense, authoritative) nodes" -ForegroundColor Gray
Write-Host "- Deep walk strategy" -ForegroundColor Gray
Write-Host "- Focus: stability over heat" -ForegroundColor Gray
