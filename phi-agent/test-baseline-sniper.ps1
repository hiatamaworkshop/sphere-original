# Test baseline gen-002 with sniper species
# Validates species-profile.json loading and decay-focused measurement

$env:SPHERE_URL = 'http://localhost:3001'
$env:SPHERE_WS = 'ws://localhost:3001'
$env:OLLAMA_HOST = 'http://localhost:11434'
$env:OLLAMA_MODEL = 'phi3:mini'
$env:LOADOUT = 'sniper'
$env:QUERY = 'lasting fundamental patterns'

Write-Host "=== Baseline Gen-002 Test: sniper ===" -ForegroundColor Cyan
Write-Host "Query: $env:QUERY" -ForegroundColor Yellow
Write-Host "Expected: species-profile.json loaded (sniper: 6 evals, h=5.4 w=4.9 d=4.6)" -ForegroundColor Gray
Write-Host "Characteristics: decay-focused (d=0.7), stability seeker, patient/selective" -ForegroundColor Gray
Write-Host ""

npm start
