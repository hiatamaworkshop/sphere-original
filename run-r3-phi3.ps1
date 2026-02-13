# ============================================================
# DEPRECATED (2026-02-13): R1+R2 が 4x2 構成に統合済み
# 全8種族は R1 (scout,hunter,archivist,sniper) + R2 (moth,balanced,scholar,wanderer) でカバー
# このスクリプトは使用しないこと
# ============================================================
Write-Host "[ERROR] run-r3-phi3.ps1 is DEPRECATED. Use run-r1-phi3.ps1 + run-r2-phi3.ps1 instead." -ForegroundColor Red
exit 1
<#
# ============================================================
# (Archive) Round 3: hunter, wanderer, sniper (phi3:mini, 15min total)
# Replacement: hermit -> hunter (to boost hunter's dataset)
# ============================================================

$baseDir = "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\phi-agent"
$peripheryDir = "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\docker_compose_sphere_v1\services\periphery"
$phase1Duration = 300  # 5 minutes
$phase2Duration = 600  # 10 minutes

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Round 3: hunter, wanderer, sniper" -ForegroundColor Cyan
Write-Host "  Model: phi3:mini | Focus: Data Recovery for Hunter" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# ===== Phase 1: 5 minutes with existing nodes =====
Write-Host "[Phase 1] Starting 3 agents for $phase1Duration seconds..." -ForegroundColor Green

# Agent commands — no explicit query → daemon rotates from QUERY_POOL each session
$cmd1 = "cd '$baseDir'; `$env:SPHERE_URL='http://localhost:3001'; `$env:SPHERE_WS='ws://localhost:3001'; `$env:OLLAMA_HOST='http://localhost:11434'; `$env:OLLAMA_MODEL='phi3:mini'; `$env:LOADOUT='hunter'; `$env:EVALUATE='true'; `$env:RESPONSE='false'; node dist/index.js --daemon --sleep 30000"
$cmd2 = "cd '$baseDir'; `$env:SPHERE_URL='http://localhost:3001'; `$env:SPHERE_WS='ws://localhost:3001'; `$env:OLLAMA_HOST='http://localhost:11434'; `$env:OLLAMA_MODEL='phi3:mini'; `$env:LOADOUT='wanderer'; `$env:EVALUATE='true'; `$env:RESPONSE='false'; node dist/index.js --daemon --sleep 30000"
$cmd3 = "cd '$baseDir'; `$env:SPHERE_URL='http://localhost:3001'; `$env:SPHERE_WS='ws://localhost:3001'; `$env:OLLAMA_HOST='http://localhost:11434'; `$env:OLLAMA_MODEL='phi3:mini'; `$env:LOADOUT='sniper'; `$env:EVALUATE='true'; `$env:RESPONSE='false'; node dist/index.js --daemon --sleep 30000"

# Start agents
$p1 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd1 -PassThru -WindowStyle Normal
$p2 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd2 -PassThru -WindowStyle Normal
$p3 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd3 -PassThru -WindowStyle Normal

Write-Host "Agents started:" -ForegroundColor Yellow
Write-Host "  - hunter   (PID: $($p1.Id))" -ForegroundColor White
Write-Host "  - wanderer (PID: $($p2.Id))" -ForegroundColor White
Write-Host "  - sniper   (PID: $($p3.Id))" -ForegroundColor White

# Monitor Phase 1
$evalLog = "$baseDir\data\eval-log.jsonl"
$phase1Start = (Get-Content $evalLog -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
if ($null -eq $phase1Start) { $phase1Start = 0 }

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

Stop-Process -Id $p1.Id -Force; Stop-Process -Id $p2.Id -Force; Stop-Process -Id $p3.Id -Force
Start-Sleep -Seconds 3
$phase1End = (Get-Content $evalLog -ErrorAction SilentlyContinue | Measure-Object -Line).Lines

# ===== Phase 2: Wave injection =====
Write-Host "`n[Phase 2] Injecting wave (50 items)..." -ForegroundColor Green
cd $peripheryDir
npx tsx src/mock/contribution.ts wave
cd $baseDir

# ===== Phase 3: 10 minutes with new nodes =====
Write-Host "[Phase 3] Restarting agents for $phase2Duration seconds..." -ForegroundColor Green

$p1 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd1 -PassThru -WindowStyle Normal
$p2 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd2 -PassThru -WindowStyle Normal
$p3 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd3 -PassThru -WindowStyle Normal

$phase3Start = $phase1End
$elapsed = 0
while ($elapsed -lt $phase2Duration) {
    Start-Sleep -Seconds $interval
    $elapsed += $interval
    $current = (Get-Content $evalLog -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
    if ($null -eq $current) { $current = 0 }
    Write-Host "[Phase 3] $elapsed/$phase2Duration sec | eval-log: $current lines (+$(($current - $phase3Start)))" -ForegroundColor Cyan
}

Stop-Process -Id $p1.Id -Force; Stop-Process -Id $p2.Id -Force; Stop-Process -Id $p3.Id -Force
$phase3End = (Get-Content $evalLog -ErrorAction SilentlyContinue | Measure-Object -Line).Lines

# Summary
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  Round 3 Complete! (Hunter Revived)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Phase 1: +$(($phase1End - $phase1Start)) | Phase 3: +$(($phase3End - $phase3Start))" -ForegroundColor White
Write-Host "Final eval-log total: $phase3End" -ForegroundColor Yellow
#>