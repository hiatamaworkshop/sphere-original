$env:ONCE = "1"
$env:MIN_EVALS = "15"
$env:MIN_PER_SPECIES = "8"
$env:DATA_DIR = "phi-agent/data"

node digestor/dist/digestor.js
