# Hermit + gemma2:2b test with word examples + 2-step pattern
# Testing weight/decay focused measurement (opposite of moth)

param(
    [string]$Query = "deep knowledge fundamental principles"
)

$env:SPHERE_URL = 'http://localhost:3001'
$env:SPHERE_WS = 'ws://localhost:3001'
$env:OLLAMA_HOST = 'http://localhost:11434'
$env:OLLAMA_MODEL = 'gemma2:2b'
$env:LOADOUT = 'hermit'
$env:QUERY = $Query

Write-Host "=== Hermit + gemma2:2b + Word Examples Pattern ===" -ForegroundColor Cyan
Write-Host "Query: $env:QUERY" -ForegroundColor Yellow
Write-Host "Pattern: single-concept + word examples + 2-step analysis" -ForegroundColor Gray
Write-Host "Expected: weight/decay focused measurement (opposite of moth)" -ForegroundColor Green
Write-Host ""

npm start
