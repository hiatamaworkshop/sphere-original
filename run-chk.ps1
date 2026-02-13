# ============================================================
# Lower-Model Verification Sandbox (Gemma / Qwen)
# 現時点では gemma の方がうまく Gen008に適応しているようだ？
# ============================================================
# 

$dataDir = "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\phi-agent\data"
$mainLog = "$dataDir\eval-log.jsonl"
$tempLog = "$dataDir\eval-log-main.jsonl"

# 1. 安全のために既存ログを退避
if (Test-Path $mainLog) {
    Write-Host "[Safety] Moving main log to temporary file..." -ForegroundColor Cyan
    Move-Item -Path $mainLog -Destination $tempLog -Force
}

$testModel = "llama3.2:1b"
Write-Host "[Start] Launching $testModel with ENGLISH-CONCISE loadout..." -ForegroundColor Yellow

# 2. 内部コマンドの組み立て（バッククォートでのエスケープを最小限に）
$innerCommand = @"
cd 'C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\phi-agent';
`$env:SPHERE_URL='http://localhost:3001';
`$env:SPHERE_WS='ws://localhost:3001';
`$env:OLLAMA_HOST='http://localhost:11434';
`$env:OLLAMA_MODEL='$testModel';
`$env:LOADOUT='scout';
`$env:EVALUATE='fake';
`$env:RESPONSE='false';
`$env:SYSTEM_PROMPT='Provide evaluation in concise English (max 40 words). Focus on logical relevance to the query.';
`$env:OLLAMA_OPTIONS='{`\"num_predict`\": 128 `\"temperature`\": 0.4}';
node dist/index.js 'cats' --daemon --sleep 30000
"@

# 3. エージェント起動（-ArgumentListを使わず直接渡すことでパースエラーを防止）
powershell -NoExit -Command $innerCommand

Write-Host "`n[Action Required]" -ForegroundColor Magenta
Write-Host "1. Observe the concise English reasoning in the agent window."
Write-Host "2. To finish: Close the agent window and restore logs with:"
Write-Host "   Move-Item -Path '$tempLog' -Destination '$mainLog' -Force" -ForegroundColor Cyan