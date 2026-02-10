# Test scout with gemma2:2b (Stage 3: gen-004)
# Validates cumulative species memory effect on gemma's h,w measurement

$env:SPHERE_URL = 'http://localhost:3001'
$env:SPHERE_WS = 'ws://localhost:3001'
$env:OLLAMA_HOST = 'http://localhost:11434'
$env:OLLAMA_MODEL = 'gemma2:2b'
$env:LOADOUT = 'scout'
$env:QUERY = 'breaking news trending viral'

Write-Host "=== STAGE 3: scout + gemma2:2b (gen-004) ===" -ForegroundColor Cyan
Write-Host "Query: $env:QUERY" -ForegroundColor Yellow
Write-Host "Species memory: gen-004 (scout: 39 evals, h=6.8 w=6.8 d=4.1)" -ForegroundColor Gray
Write-Host "gen-002→gen-004 change: +22 evals, w +1.79 (5.01→6.8)" -ForegroundColor Gray
Write-Host "Hypothesis: Stronger species memory (39 evals) improves h,w stability" -ForegroundColor Magenta
Write-Host ""

npm start
