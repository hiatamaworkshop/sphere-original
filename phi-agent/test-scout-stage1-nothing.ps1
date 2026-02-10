# Test scout with gemma2:2b (Stage 1: no species memory)
# Validates gemma's h measurement baseline without calibration

$env:SPHERE_URL = 'http://localhost:3001'
$env:SPHERE_WS = 'ws://localhost:3001'
$env:OLLAMA_HOST = 'http://localhost:11434'
$env:OLLAMA_MODEL = 'gemma2:2b'
$env:LOADOUT = 'scout'
$env:QUERY = 'breaking news trending viral'

Write-Host "=== STAGE 1: scout + gemma2:2b (NO species memory) ===" -ForegroundColor Cyan
Write-Host "Query: $env:QUERY" -ForegroundColor Yellow
Write-Host "Species memory: NONE (baseline h stamp expected)" -ForegroundColor Gray
Write-Host "scout characteristics: heat-focused (h=0.5), frustration-driven, hot pursuit" -ForegroundColor Gray
Write-Host "Hypothesis: gemma h output will be fixed (stamp behavior)" -ForegroundColor Magenta
Write-Host ""
Write-Host "⚠️  BEFORE RUNNING: Backup species-profile.json and remove/empty it" -ForegroundColor Red
Write-Host ""

npm start
