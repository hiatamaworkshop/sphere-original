# Speed test: phi3:mini (RESPONSE=false)
$env:SPHERE_URL = "http://localhost:3001"
$env:SPHERE_WS = "ws://localhost:3001"
$env:OLLAMA_HOST = "http://localhost:11434"
$env:OLLAMA_MODEL = "phi3:mini"
$env:LOADOUT = "balanced"
$env:EVALUATE = "true"
$env:RESPONSE = "false"

cd "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\phi-agent"
node dist/index.js "knowledge exploration"
