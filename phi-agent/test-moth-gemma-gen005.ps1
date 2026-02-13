# Moth + gemma2:2b test with word examples + 2-step pattern
# Testing single-concept evalFocus effectiveness

param(
    [string]$Query = "trending viral discussions"
)

$env:SPHERE_URL = 'http://localhost:3001'
$env:SPHERE_WS = 'ws://localhost:3001'
$env:OLLAMA_HOST = 'http://localhost:11434'
$env:OLLAMA_MODEL = 'gemma2:2b'
$env:LOADOUT = 'moth'
$env:QUERY = $Query

Write-Host "=== Moth + gemma2:2b + Word Examples Pattern ===" -ForegroundColor Cyan
Write-Host "Query: $env:QUERY" -ForegroundColor Yellow
Write-Host "Pattern: single-concept + word examples + 2-step analysis" -ForegroundColor Gray
Write-Host "Expected: similar improvement as scout (h/w/d range expansion)" -ForegroundColor Green
Write-Host ""

npm start
