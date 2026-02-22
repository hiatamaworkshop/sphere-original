# Balanced daemon initialization — 2 queries × 5 sessions each
# For establishing initial species-profile.json

$env:SPHERE_URL = 'http://localhost:3001'
$env:SPHERE_WS = 'ws://localhost:3001'
$env:OLLAMA_HOST = 'http://localhost:11434'
$env:OLLAMA_MODEL = 'phi3:mini'
$env:LOADOUT = 'balanced'

Write-Host "=== Balanced Daemon Init (Query 1: everyday curious observations) ===" -ForegroundColor Cyan
for ($i = 1; $i -le 5; $i++) {
    Write-Host "`n--- Session $i/5 (Query 1) ---" -ForegroundColor Yellow
    $env:QUERY = 'everyday curious observations'
    npm start
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Session $i failed, stopping." -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n=== Query 2: common social behaviors ===" -ForegroundColor Cyan
for ($i = 1; $i -le 5; $i++) {
    Write-Host "`n--- Session $i/5 (Query 2) ---" -ForegroundColor Yellow
    $env:QUERY = 'common social behaviors'
    npm start
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Session $i failed, stopping." -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n=== All 10 sessions complete ===" -ForegroundColor Green
Write-Host "Check phi-agent/data/eval-log.jsonl for results."
Write-Host "Run digestor with: `$env:ONCE='1'; `$env:MIN_EVALS='15'; `$env:MIN_PER_SPECIES='8'; `$env:DATA_DIR='./phi-agent/data'; node digestor/dist/digestor.js"
