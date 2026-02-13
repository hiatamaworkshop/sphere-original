# ============================================================
# Round 1: balanced, scholar, scout (phi3:mini)
# Evolution: Randomized Query Injection
# ============================================================

$baseDir = "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\phi-agent"
$peripheryDir = "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\docker_compose_sphere_v1\services\periphery"
$phase1Duration = 300  # 5 minutes
$phase2Duration = 600  # 10 minutes

# --- クエリプールの定義 ---
# 各種族の「専門性」に合わせたランダムな候補
$pool_balanced = @("knowledge exploration", "holistic systems", "cross-disciplinary links", "general synthesis")
$pool_scholar  = @("fundamental mathematics", "quantum field theory", "ancient linguistics", "statistical mechanics", "formal logic")
$pool_scout    = @("trending viral discussions", "emerging subcultures", "real-time news pulse", "digital frontier shifts")

# 実行ごとにランダムに選択
$q1 = $pool_balanced | Get-Random
$q2 = $pool_scholar  | Get-Random
$q3 = $pool_scout    | Get-Random

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Round 1: balanced, scholar, scout" -ForegroundColor Cyan
Write-Host "  Selected Queries:" -ForegroundColor Yellow
Write-Host "  - Balanced: $q1" -ForegroundColor Gray
Write-Host "  - Scholar:  $q2" -ForegroundColor Gray
Write-Host "  - Scout:    $q3" -ForegroundColor Gray
Write-Host "========================================`n" -ForegroundColor Cyan

# --- コマンドの組み立て ---
function Get-AgentCmd($loadout, $query) {
    return "cd '$baseDir'; `$env:SPHERE_URL='http://localhost:3001'; `$env:SPHERE_WS='ws://localhost:3001'; `$env:OLLAMA_HOST='http://localhost:11434'; `$env:OLLAMA_MODEL='phi3:mini'; `$env:LOADOUT='$loadout'; `$env:EVALUATE='true'; `$env:RESPONSE='false'; node dist/index.js '$query' --daemon --sleep 30000"
}

$cmd1 = Get-AgentCmd "balanced" $q1
$cmd2 = Get-AgentCmd "scholar"  $q2
$cmd3 = Get-AgentCmd "scout"    $q3

# ===== Phase 1: Initial Exploration =====
Write-Host "[Phase 1] Starting agents for $phase1Duration seconds..." -ForegroundColor Green

$p1 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd1 -PassThru -WindowStyle Normal
$p2 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd2 -PassThru -WindowStyle Normal
$p3 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd3 -PassThru -WindowStyle Normal

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

Stop-Process -Id $p1.Id, $p2.Id, $p3.Id -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# ===== Phase 2: Wave Injection =====
Write-Host "`n[Phase 2] Injecting wave (50 items)..." -ForegroundColor Green
cd $peripheryDir
npx tsx src/mock/contribution.ts wave
cd $baseDir

# ===== Phase 3: Post-Wave Exploration =====
Write-Host "`n[Phase 3] Restarting agents for $phase2Duration seconds..." -ForegroundColor Green

$p1 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd1 -PassThru -WindowStyle Normal
$p2 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd2 -PassThru -WindowStyle Normal
$p3 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd3 -PassThru -WindowStyle Normal

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

Stop-Process -Id $p1.Id, $p2.Id, $p3.Id -Force -ErrorAction SilentlyContinue
$phase3End = (Get-Content $evalLog -ErrorAction SilentlyContinue | Measure-Object -Line).Lines

# ===== Summary =====
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  Round 1 Complete (Randomized)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Total new log entries: $(($phase3End - $phase1Start))" -ForegroundColor Yellow