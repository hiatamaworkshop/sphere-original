# Test scout with gemma2:2b (Stage 2: gen-002 baseline)
# Validates if scout species memory (6 evals) activates gemma's h measurement

$env:SPHERE_URL = 'http://localhost:3001'
$env:SPHERE_WS = 'ws://localhost:3001'
$env:OLLAMA_HOST = 'http://localhost:11434'
$env:OLLAMA_MODEL = 'gemma2:2b'
$env:LOADOUT = 'scout'
$env:QUERY = 'breaking news trending viral'

Write-Host "=== STAGE 2: scout + gemma2:2b (gen-002 baseline) ===" -ForegroundColor Cyan
Write-Host "Query: $env:QUERY" -ForegroundColor Yellow
Write-Host "Species memory: gen-002 (scout: 6 evals, weak baseline)" -ForegroundColor Gray
Write-Host "Hypothesis: Even weak species memory (6 evals) affects h measurement?" -ForegroundColor Magenta
Write-Host ""
Write-Host "⚠️  BEFORE RUNNING: Restore gen-002.json as species-profile.json" -ForegroundColor Red
Write-Host ""

npm start
