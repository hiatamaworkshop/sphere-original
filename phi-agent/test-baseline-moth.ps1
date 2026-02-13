# Test baseline gen-002 with moth species
# Validates species-profile.json loading and measurement capability

$env:SPHERE_URL = 'http://localhost:3001'
$env:SPHERE_WS = 'ws://localhost:3001'
$env:OLLAMA_HOST = 'http://localhost:11434'
$env:OLLAMA_MODEL = 'phi3:mini'
$env:LOADOUT = 'moth'
$env:QUERY = 'trending viral discussions'

Write-Host "=== Baseline Gen-002 Test: moth ===" -ForegroundColor Cyan
Write-Host "Query: $env:QUERY" -ForegroundColor Yellow
Write-Host "Expected: species-profile.json loaded (moth: 108 evals, h=6.7 w=6.2 d=4.1)" -ForegroundColor Gray
Write-Host ""

npm start
