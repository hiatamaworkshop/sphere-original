# ============================================================
# Round 2: moth, balanced, scholar, wanderer (phi3:mini)
# Mix: 1 active (moth) + 1 moderate (balanced) + 2 quiet (scholar, wanderer)
# Query: auto-rotation from built-in QUERY_POOL
# ============================================================

$baseDir = "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\phi-agent"
$peripheryDir = "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\docker_compose_sphere_v1\services\periphery"
$phase1Duration = 300  # 5 minutes
$phase2Duration = 600  # 10 minutes

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Round 2: moth, balanced, scholar, wanderer" -ForegroundColor Cyan
Write-Host "  Query: auto-rotation from built-in pool" -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Cyan

# --- No explicit query -> daemon rotates from QUERY_POOL each session ---
function Get-AgentCmd($loadout) {
    return "cd '$baseDir'; `$env:SPHERE_URL='http://localhost:3001'; `$env:SPHERE_WS='ws://localhost:3001'; `$env:OLLAMA_HOST='http://localhost:11434'; `$env:OLLAMA_MODEL='phi3:mini'; `$env:LOADOUT='$loadout'; `$env:EVALUATE='true'; `$env:RESPONSE='false'; node dist/index.js --daemon --sleep 30000"
}

$cmd1 = Get-AgentCmd "moth"
$cmd2 = Get-AgentCmd "balanced"
$cmd3 = Get-AgentCmd "scholar"
$cmd4 = Get-AgentCmd "wanderer"

# ===== Phase 1: Initial Exploration =====
Write-Host "[Phase 1] Starting 4 agents for $phase1Duration seconds..." -ForegroundColor Green

$p1 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd1 -PassThru -WindowStyle Normal
$p2 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd2 -PassThru -WindowStyle Normal
$p3 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd3 -PassThru -WindowStyle Normal
$p4 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd4 -PassThru -WindowStyle Normal

Write-Host "Agents started:" -ForegroundColor Yellow
Write-Host "  - moth      (PID: $($p1.Id)) [active]" -ForegroundColor White
Write-Host "  - balanced  (PID: $($p2.Id)) [moderate]" -ForegroundColor White
Write-Host "  - scholar   (PID: $($p3.Id)) [quiet]" -ForegroundColor Gray
Write-Host "  - wanderer  (PID: $($p4.Id)) [quiet]" -ForegroundColor Gray

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
    Write-Host "[Phase 1] $elapsed/$phase1Duration sec | eval-log lines: $current (+$(($current - $phase1Start)))" -ForegroundColor Cyan
}

Stop-Process -Id $p1.Id, $p2.Id, $p3.Id, $p4.Id -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# ===== Phase 2: Wave Injection =====
Write-Host "`n[Phase 2] Injecting wave (50 items)..." -ForegroundColor Green
cd $peripheryDir
npx tsx src/mock/contribution.ts wave
cd $baseDir

# ===== Phase 3: Post-Wave Exploration =====
Write-Host "`n[Phase 3] Restarting 4 agents for $phase2Duration seconds..." -ForegroundColor Green

$p1 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd1 -PassThru -WindowStyle Normal
$p2 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd2 -PassThru -WindowStyle Normal
$p3 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd3 -PassThru -WindowStyle Normal
$p4 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd4 -PassThru -WindowStyle Normal

$phase1End = (Get-Content $evalLog -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
if ($null -eq $phase1End) { $phase1End = 0 }

$elapsed = 0
while ($elapsed -lt $phase2Duration) {
    Start-Sleep -Seconds $interval
    $elapsed += $interval
    $current = (Get-Content $evalLog -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
    if ($null -eq $current) { $current = 0 }
    Write-Host "[Phase 3] $elapsed/$phase2Duration sec | eval-log lines: $current (+$(($current - $phase1End)))" -ForegroundColor Cyan
}

Stop-Process -Id $p1.Id, $p2.Id, $p3.Id, $p4.Id -Force -ErrorAction SilentlyContinue
$phase3End = (Get-Content $evalLog -ErrorAction SilentlyContinue | Measure-Object -Line).Lines

# ===== Summary =====
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  Round 2 Complete" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Species: moth, balanced, scholar, wanderer" -ForegroundColor White
Write-Host "  Total new log entries: $(($phase3End - $phase1Start))" -ForegroundColor Yellow

# Show last 3 entries
Write-Host "`nLast 3 eval-log entries:" -ForegroundColor Cyan
Get-Content $evalLog | Select-Object -Last 3 | ForEach-Object {
    $entry = $_ | ConvertFrom-Json
    Write-Host "  - $($entry.loadout) ($($entry.model)) | $($entry.evaluations.Count) evals" -ForegroundColor Yellow
}

Write-Host "`n[Next] Run Digestor to process gen-009" -ForegroundColor Magenta
Write-Host ""
