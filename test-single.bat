@echo off
cd /d "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\phi-agent"
set SPHERE_URL=http://localhost:3001
set SPHERE_WS=ws://localhost:3001
set OLLAMA_HOST=http://localhost:11434
set OLLAMA_MODEL=gemma2:2b
set LOADOUT=wanderer
set EVALUATE=true
set RESPONSE=false
node dist/index.js "food" --cycles 3
