# Test baseline sniper with gemma2:2b (Stage 2: gen-003)
# Validates cumulative species memory effect on gemma's d measurement

$env:SPHERE_URL = 'http://localhost:3001'
$env:SPHERE_WS = 'ws://localhost:3001'
$env:OLLAMA_HOST = 'http://localhost:11434'
$env:OLLAMA_MODEL = 'gemma2:2b'
$env:LOADOUT = 'sniper'
$env:QUERY = 'lasting fundamental patterns'

Write-Host "=== STAGE 2: Gen-003 Test: sniper + gemma2:2b ===" -ForegroundColor Cyan
Write-Host "Query: $env:QUERY" -ForegroundColor Yellow
Write-Host "Species memory: 35 evals (3 models mixed), d_avg=5.5" -ForegroundColor Gray
Write-Host "Stage 1 result: d=2-6 (mean 4.2) with gen-002 baseline" -ForegroundColor Gray
Write-Host "Hypothesis: gen-003 (d=5.5) stabilizes or shifts d measurement?" -ForegroundColor Magenta
Write-Host ""

npm start
