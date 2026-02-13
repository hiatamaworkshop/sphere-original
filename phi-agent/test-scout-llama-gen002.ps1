# Test scout with llama3.2:1b (gen-002 baseline)
# Validates if scout species memory activates llama's h measurement

$env:SPHERE_URL = 'http://localhost:3001'
$env:SPHERE_WS = 'ws://localhost:3001'
$env:OLLAMA_HOST = 'http://localhost:11434'
$env:OLLAMA_MODEL = 'llama3.2:1b'
$env:LOADOUT = 'scout'
$env:QUERY = 'breaking news trending viral'

Write-Host "=== llama3.2:1b + scout (gen-002 baseline) ===" -ForegroundColor Cyan
Write-Host "Query: $env:QUERY" -ForegroundColor Yellow
Write-Host "Species memory: gen-002 (scout: 17 evals, h=6.55 w=5.01 d=4.06)" -ForegroundColor Gray
Write-Host "scout characteristics: heat-focused (h=0.5), frustration-driven, hot pursuit" -ForegroundColor Gray
Write-Host "Hypothesis: llama + gen-002 provides stronger baseline than gemma alone" -ForegroundColor Magenta
Write-Host ""

npm start
