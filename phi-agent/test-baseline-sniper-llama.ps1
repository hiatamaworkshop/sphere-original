# Test baseline sniper with llama3.2:1b
# Validates if species memory (d_avg=6.0) affects llama's d output

$env:SPHERE_URL = 'http://localhost:3001'
$env:SPHERE_WS = 'ws://localhost:3001'
$env:OLLAMA_HOST = 'http://localhost:11434'
$env:OLLAMA_MODEL = 'llama3.2:1b'
$env:LOADOUT = 'sniper'
$env:QUERY = 'lasting fundamental patterns'

Write-Host "=== Baseline Gen-002 Test: sniper + llama3.2:1b ===" -ForegroundColor Cyan
Write-Host "Query: $env:QUERY" -ForegroundColor Yellow
Write-Host "Species memory: 14 evals, h=6.9 w=6.2 d=6.0 (phi3:mini baseline)" -ForegroundColor Gray
Write-Host "Known: llama h,w measurable (range ~1pt), d fixed" -ForegroundColor Gray
Write-Host "Hypothesis: species memory d=6.0 influences llama's d output?" -ForegroundColor Magenta
Write-Host ""

npm start
