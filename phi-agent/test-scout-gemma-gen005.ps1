# Scout + gemma2:2b + gen-005 clean baseline test
# Previous: gen-004 → h=7 fixed (re-fixation)
# Expected: gen-005 stronger baseline → fixation reduction?

param(
    [string]$Query = "breaking news trending viral"
)

$env:SPHERE_URL = 'http://localhost:3001'
$env:SPHERE_WS = 'ws://localhost:3001'
$env:OLLAMA_HOST = 'http://localhost:11434'
$env:OLLAMA_MODEL = 'gemma2:2b'
$env:LOADOUT = 'scout'
$env:QUERY = $Query

Write-Host "=== Scout + gemma2:2b + gen-005 Clean Baseline ===" -ForegroundColor Cyan
Write-Host "Query: $env:QUERY" -ForegroundColor Yellow
Write-Host "Baseline: gen-005 (14 balanced evals, high diversity)" -ForegroundColor Gray
Write-Host "Previous results:" -ForegroundColor Gray
Write-Host "  gen-002 (6 evals): h=5-8, w=6-8 (fixation reduced)" -ForegroundColor Gray
Write-Host "  gen-004 (15 evals): h=7 fixed (re-fixation)" -ForegroundColor Gray
Write-Host "Expected: gen-005 clean baseline → fixation reduction?" -ForegroundColor Green
Write-Host ""

npm start
