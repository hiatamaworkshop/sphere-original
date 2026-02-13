# Run Digestor (one-shot mode)
$env:DATA_DIR = "..\phi-agent\data"
$env:ONCE = "1"

cd "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\digestor"
node dist/digestor.js
