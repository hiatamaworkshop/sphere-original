# ============================================================
# Round 2: archivist, hunter, moth (phi3:mini, 15min total)
# Phase 1: 5min with existing nodes
# Phase 2: wave injection
# Phase 3: 10min with new nodes
# ============================================================

$baseDir = "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\phi-agent"
$peripheryDir = "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\docker_compose_sphere_v1\services\periphery"
$phase1Duration = 300  # 5 minutes (initial exploration)
$phase2Duration = 600  # 10 minutes (with new nodes)

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Round 2: archivist, hunter, moth" -ForegroundColor Cyan
Write-Host "  Model: phi3:mini" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# ===== Phase 1: 5 minutes with existing nodes =====
Write-Host "[Phase 1] Starting 3 agents for $phase1Duration seconds (existing nodes)..." -ForegroundColor Green

# Agent commands
$cmd1 = "cd '$baseDir'; `$env:SPHERE_URL='http://localhost:3001'; `$env:SPHERE_WS='ws://localhost:3001'; `$env:OLLAMA_HOST='http://localhost:11434'; `$env:OLLAMA_MODEL='phi3:mini'; `$env:LOADOUT='archivist'; `$env:EVALUATE='true'; `$env:RESPONSE='false'; node dist/index.js 'philosophical foundations' --daemon --sleep 30000"
$cmd2 = "cd '$baseDir'; `$env:SPHERE_URL='http://localhost:3001'; `$env:SPHERE_WS='ws://localhost:3001'; `$env:OLLAMA_HOST='http://localhost:11434'; `$env:OLLAMA_MODEL='phi3:mini'; `$env:LOADOUT='hunter'; `$env:EVALUATE='true'; `$env:RESPONSE='false'; node dist/index.js 'emerging technology trends' --daemon --sleep 30000"
$cmd3 = "cd '$baseDir'; `$env:SPHERE_URL='http://localhost:3001'; `$env:SPHERE_WS='ws://localhost:3001'; `$env:OLLAMA_HOST='http://localhost:11434'; `$env:OLLAMA_MODEL='phi3:mini'; `$env:LOADOUT='moth'; `$env:EVALUATE='true'; `$env:RESPONSE='false'; node dist/index.js 'creative art movements' --daemon --sleep 30000"

# Start agents
$p1 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd1 -PassThru -WindowStyle Normal
$p2 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd2 -PassThru -WindowStyle Normal
$p3 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd3 -PassThru -WindowStyle Normal

Write-Host "Agents started:" -ForegroundColor Yellow
Write-Host "  - archivist (PID: $($p1.Id))" -ForegroundColor White
Write-Host "  - hunter    (PID: $($p2.Id))" -ForegroundColor White
Write-Host "  - moth      (PID: $($p3.Id))" -ForegroundColor White
Write-Host ""

# Monitor Phase 1
$evalLog = "$baseDir\data\eval-log.jsonl"
$phase1Start = (Get-Content $evalLog -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
if ($null -eq $phase1Start) { $phase1Start = 0 }

Write-Host "[Phase 1] Initial eval-log: $phase1Start lines" -ForegroundColor Cyan
Write-Host "[Phase 1] Running for $phase1Duration seconds...`n" -ForegroundColor Cyan

# Wait Phase 1
$elapsed = 0
$interval = 60
while ($elapsed -lt $phase1Duration) {
    Start-Sleep -Seconds $interval
    $elapsed += $interval
    $current = (Get-Content $evalLog -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
    if ($null -eq $current) { $current = 0 }
    Write-Host "[Phase 1] $elapsed/$phase1Duration sec | eval-log: $current lines (+$(($current - $phase1Start)))" -ForegroundColor Cyan
}

Write-Host "`n[Phase 1] Complete. Stopping agents..." -ForegroundColor Yellow
Stop-Process -Id $p1.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $p2.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $p3.Id -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

$phase1End = (Get-Content $evalLog -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
if ($null -eq $phase1End) { $phase1End = 0 }
Write-Host "[Phase 1] Added: $(($phase1End - $phase1Start)) entries`n" -ForegroundColor Green

# ===== Phase 2: Wave injection =====
Write-Host "[Phase 2] Injecting wave (50 items, 3s delay)..." -ForegroundColor Green
cd $peripheryDir
$waveOutput = npx tsx src/mock/contribution.ts wave 2>&1 | Out-String
Write-Host $waveOutput -ForegroundColor White
cd $baseDir

# ===== Phase 3: 10 minutes with new nodes =====
Write-Host "`n[Phase 3] Restarting 3 agents for $phase2Duration seconds (new nodes included)..." -ForegroundColor Green

# Restart agents
$p1 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd1 -PassThru -WindowStyle Normal
$p2 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd2 -PassThru -WindowStyle Normal
$p3 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd3 -PassThru -WindowStyle Normal

Write-Host "Agents restarted:" -ForegroundColor Yellow
Write-Host "  - archivist (PID: $($p1.Id))" -ForegroundColor White
Write-Host "  - hunter    (PID: $($p2.Id))" -ForegroundColor White
Write-Host "  - moth      (PID: $($p3.Id))" -ForegroundColor White
Write-Host ""

$phase3Start = $phase1End

# Wait Phase 3
$elapsed = 0
while ($elapsed -lt $phase2Duration) {
    Start-Sleep -Seconds $interval
    $elapsed += $interval
    $current = (Get-Content $evalLog -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
    if ($null -eq $current) { $current = 0 }
    Write-Host "[Phase 3] $elapsed/$phase2Duration sec | eval-log: $current lines (+$(($current - $phase3Start)))" -ForegroundColor Cyan
}

Write-Host "`n[Phase 3] Complete. Stopping agents..." -ForegroundColor Yellow
Stop-Process -Id $p1.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $p2.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $p3.Id -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

$phase3End = (Get-Content $evalLog -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
if ($null -eq $phase3End) { $phase3End = 0 }

# ===== Summary =====
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  Round 2 Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Phase 1 (existing nodes): +$(($phase1End - $phase1Start)) entries" -ForegroundColor White
Write-Host "Phase 3 (with new nodes): +$(($phase3End - $phase3Start)) entries" -ForegroundColor White
Write-Host "Total new entries:        $(($phase3End - $phase1Start))" -ForegroundColor Yellow
Write-Host "Final eval-log lines:     $phase3End" -ForegroundColor White
Write-Host ""

# Show last 3 entries
Write-Host "Last 3 eval-log entries:" -ForegroundColor Cyan
Get-Content $evalLog | Select-Object -Last 3 | ForEach-Object {
    $entry = $_ | ConvertFrom-Json
    Write-Host "  - $($entry.loadout) ($($entry.model)) | $($entry.evaluations.Count) evals" -ForegroundColor Yellow
}

Write-Host "`n[Next] Continue with R3 or run Digestor" -ForegroundColor Magenta
Write-Host ""
