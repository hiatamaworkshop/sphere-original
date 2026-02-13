#!/bin/bash
# A/B Test: Species Memory Effect on Node Selection
# Compare which nodes each species selects WITH vs WITHOUT species-profile.json
#
# Prerequisites: periphery running on :3001 (with mock data), Ollama running
# Usage: bash test-ab-species-memory.sh

set -e

SPECIES=(balanced scholar moth hunter sniper wanderer)
QUERY="psychology"
CYCLES=3
MODEL="gemma2:2b"
SPHERE_URL="http://localhost:3001"
SPHERE_WS="ws://localhost:3001"
OLLAMA_HOST="http://localhost:11434"
PROFILE="phi-agent/data/species-profile.json"
OUTDIR="test-ab-output"

rm -rf "$OUTDIR"
mkdir -p "$OUTDIR"

echo "=== A/B Species Memory Test ==="
echo "Species: ${SPECIES[*]}"
echo "Model: $MODEL, Cycles: $CYCLES, Query: $QUERY"
echo ""

# --- Phase A: WITH species profile ---
echo ">>> Phase A: WITH species-profile.json (gen-011)"
for s in "${SPECIES[@]}"; do
  echo "  Running $s ..."
  SPHERE_URL="$SPHERE_URL" \
  SPHERE_WS="$SPHERE_WS" \
  OLLAMA_HOST="$OLLAMA_HOST" \
  OLLAMA_MODEL="$MODEL" \
  LOADOUT="$s" \
  EVALUATE="true" \
  RESPONSE="false" \
  node phi-agent/dist/index.js "$QUERY" --cycles "$CYCLES" > "$OUTDIR/A_${s}.txt" 2>&1 || true
  # Extract key info immediately
  NODES=$(grep "Focused:" "$OUTDIR/A_${s}.txt" 2>/dev/null | head -5)
  echo "    $NODES"
done
echo "  Phase A done."
echo ""

# --- Rename profile (disable species memory) ---
echo ">>> Disabling species profile..."
cp "$PROFILE" "${PROFILE}.bak"
mv "$PROFILE" "${PROFILE}.disabled"

# --- Phase B: WITHOUT species profile ---
echo ">>> Phase B: WITHOUT species-profile.json (no memory)"
for s in "${SPECIES[@]}"; do
  echo "  Running $s ..."
  SPHERE_URL="$SPHERE_URL" \
  SPHERE_WS="$SPHERE_WS" \
  OLLAMA_HOST="$OLLAMA_HOST" \
  OLLAMA_MODEL="$MODEL" \
  LOADOUT="$s" \
  EVALUATE="true" \
  RESPONSE="false" \
  node phi-agent/dist/index.js "$QUERY" --cycles "$CYCLES" > "$OUTDIR/B_${s}.txt" 2>&1 || true
  NODES=$(grep "Focused:" "$OUTDIR/B_${s}.txt" 2>/dev/null | head -5)
  echo "    $NODES"
done
echo "  Phase B done."

# --- Restore profile ---
echo ""
echo ">>> Restoring species profile..."
mv "${PROFILE}.disabled" "$PROFILE"

# --- Compare ---
echo ""
echo "============================================"
echo "  RESULTS: Node Selection Comparison"
echo "============================================"
echo ""

for s in "${SPECIES[@]}"; do
  echo "=== $s ==="

  # Profile status
  PROF_A=$(grep "Species profile:" "$OUTDIR/A_${s}.txt" 2>/dev/null | head -1)
  PROF_B=$(grep "Species profile:" "$OUTDIR/B_${s}.txt" 2>/dev/null | head -1)
  echo "  A: $PROF_A"
  echo "  B: $PROF_B"

  # Focused nodes (which nodes were picked by FastGate)
  echo "  --- Focused nodes ---"
  echo "  A:"
  grep "Focused:" "$OUTDIR/A_${s}.txt" 2>/dev/null | sed 's/.*Focused:/    /' || echo "    (none)"
  echo "  B:"
  grep "Focused:" "$OUTDIR/B_${s}.txt" 2>/dev/null | sed 's/.*Focused:/    /' || echo "    (none)"

  # Evaluation scores
  echo "  --- Evaluations ---"
  echo "  A:"
  grep "phi eval:" "$OUTDIR/A_${s}.txt" 2>/dev/null | sed 's/.*phi eval:/    /' || echo "    (none)"
  echo "  B:"
  grep "phi eval:" "$OUTDIR/B_${s}.txt" 2>/dev/null | sed 's/.*phi eval:/    /' || echo "    (none)"

  # Sensed node counts
  SENSE_A=$(grep "Sensed" "$OUTDIR/A_${s}.txt" 2>/dev/null | head -3)
  SENSE_B=$(grep "Sensed" "$OUTDIR/B_${s}.txt" 2>/dev/null | head -3)
  echo "  --- Sense ---"
  echo "  A: $SENSE_A"
  echo "  B: $SENSE_B"

  echo ""
done

echo "============================================"
echo "  Raw output: $OUTDIR/A_*.txt, B_*.txt"
echo "============================================"
