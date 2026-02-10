# Clean baseline reinforcement with phi3:mini + balanced
# Multi-query diversity for gen-003 clean baseline

param(
    [string]$Query = "knowledge exploration"
)

$env:SPHERE_URL = 'http://localhost:3001'
$env:SPHERE_WS = 'ws://localhost:3001'
$env:OLLAMA_HOST = 'http://localhost:11434'
$env:OLLAMA_MODEL = 'phi3:mini'
$env:LOADOUT = 'balanced'
$env:QUERY = $Query

Write-Host "=== Clean Baseline: phi3:mini + balanced ===" -ForegroundColor Cyan
Write-Host "Query: $env:QUERY" -ForegroundColor Yellow
Write-Host "Starting from: gen-002 (clean)" -ForegroundColor Gray
Write-Host "Target: gen-003 (reinforced clean baseline)" -ForegroundColor Gray
Write-Host ""

npm start
