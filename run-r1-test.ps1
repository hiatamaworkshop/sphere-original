# ============================================================
# Round 1 Test: balanced, scholar, scout (10 minutes)
# ============================================================

$baseDir = "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\phi-agent"
$duration = 600  # 10 minutes

Write-Host "[R1] Starting 3 agents in parallel for $duration seconds..." -ForegroundColor Cyan

# Agent 1: balanced + "knowledge exploration"
$cmd1 = "cd '$baseDir'; `$env:SPHERE_URL='http://localhost:3001'; `$env:SPHERE_WS='ws://localhost:3001'; `$env:OLLAMA_HOST='http://localhost:11434'; `$env:OLLAMA_MODEL='llama3.2:1b'; `$env:LOADOUT='balanced'; `$env:EVALUATE='true'; `$env:RESPONSE='false'; node dist/index.js 'knowledge exploration' --daemon --sleep 30000"

# Agent 2: scholar + "fundamental mathematics"
$cmd2 = "cd '$baseDir'; `$env:SPHERE_URL='http://localhost:3001'; `$env:SPHERE_WS='ws://localhost:3001'; `$env:OLLAMA_HOST='http://localhost:11434'; `$env:OLLAMA_MODEL='llama3.2:1b'; `$env:LOADOUT='scholar'; `$env:EVALUATE='true'; `$env:RESPONSE='false'; node dist/index.js 'fundamental mathematics' --daemon --sleep 30000"

# Agent 3: scout + "trending viral discussions"
$cmd3 = "cd '$baseDir'; `$env:SPHERE_URL='http://localhost:3001'; `$env:SPHERE_WS='ws://localhost:3001'; `$env:OLLAMA_HOST='http://localhost:11434'; `$env:OLLAMA_MODEL='llama3.2:1b'; `$env:LOADOUT='scout'; `$env:EVALUATE='true'; `$env:RESPONSE='false'; node dist/index.js 'trending viral discussions' --daemon --sleep 30000"

# Start processes in new windows
$p1 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd1 -PassThru -WindowStyle Normal
$p2 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd2 -PassThru -WindowStyle Normal
$p3 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd3 -PassThru -WindowStyle Normal

Write-Host "[R1] Agents started:" -ForegroundColor Green
Write-Host "  - balanced (PID: $($p1.Id))" -ForegroundColor Yellow
Write-Host "  - scholar  (PID: $($p2.Id))" -ForegroundColor Yellow
Write-Host "  - scout    (PID: $($p3.Id))" -ForegroundColor Yellow
Write-Host ""

# Monitor eval-log growth
$evalLog = "$baseDir\data\eval-log.jsonl"
$initialLines = (Get-Content $evalLog -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
if ($null -eq $initialLines) { $initialLines = 0 }

Write-Host "[R1] Initial eval-log lines: $initialLines" -ForegroundColor Cyan
Write-Host "[R1] Monitoring for $duration seconds..." -ForegroundColor Cyan
Write-Host ""

# Wait with progress updates every 60s
$elapsed = 0
$interval = 60
while ($elapsed -lt $duration) {
    Start-Sleep -Seconds $interval
    $elapsed += $interval

    $currentLines = (Get-Content $evalLog -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
    if ($null -eq $currentLines) { $currentLines = 0 }
    $newLines = $currentLines - $initialLines

    Write-Host "[R1] $elapsed/$duration sec elapsed | eval-log: +$newLines lines (total: $currentLines)" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "[R1] 10 minutes completed. Stopping agents..." -ForegroundColor Yellow

# Stop processes
Stop-Process -Id $p1.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $p2.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $p3.Id -Force -ErrorAction SilentlyContinue

# Final eval-log check
Start-Sleep -Seconds 2
$finalLines = (Get-Content $evalLog -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
if ($null -eq $finalLines) { $finalLines = 0 }
$totalNew = $finalLines - $initialLines

Write-Host ""
Write-Host "[R1] Round 1 complete!" -ForegroundColor Green
Write-Host "  Initial lines: $initialLines" -ForegroundColor White
Write-Host "  Final lines:   $finalLines" -ForegroundColor White
Write-Host "  New entries:   $totalNew" -ForegroundColor Green
Write-Host ""

# Show last 3 entries
Write-Host "[R1] Last 3 eval-log entries:" -ForegroundColor Cyan
Get-Content $evalLog | Select-Object -Last 3 | ForEach-Object {
    $entry = $_ | ConvertFrom-Json
    Write-Host "  - $($entry.loadout) @ $(Get-Date -UnixTimeSeconds ($entry.timestamp/1000) -Format 'HH:mm:ss') | $($entry.evaluations.Count) evals" -ForegroundColor Yellow
}
