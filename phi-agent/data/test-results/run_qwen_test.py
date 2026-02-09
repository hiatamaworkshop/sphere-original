#!/usr/bin/env python3
"""
qwen2.5:0.5b Model Comparison Test Runner

Executes 4 species tests (balanced, hunter, scholar, hermit) and records results.
"""

import subprocess
import json
import time
from pathlib import Path
from datetime import datetime


# Test configuration
SPECIES = ["balanced", "hunter", "scholar", "hermit"]
MODEL = "qwen2.5:0.5b"
QUERY = "knowledge exploration"
SPHERE_URL = "http://sphere-periphery:3001"
SPHERE_WS = "ws://sphere-periphery:3001"
OLLAMA_HOST = "http://host.docker.internal:11434"
TIMEOUT = 300


def execute_phi_agent(species: str) -> tuple[str, float]:
    """Execute phi-agent and return (stdout, execution_time)."""
    cmd = [
        "docker", "run", "--rm",
        "--network", "sphere-network",
        "-v", "sphere-phi-agent-data:/app/data",
        "-e", f"LOADOUT={species}",
        "-e", f"QUERY={QUERY}",
        "-e", f"SPHERE_URL={SPHERE_URL}",
        "-e", f"SPHERE_WS={SPHERE_WS}",
        "-e", f"OLLAMA_HOST={OLLAMA_HOST}",
        "-e", f"OLLAMA_MODEL={MODEL}",
        "-e", "DAEMON=false",
        "phi-agent:latest"
    ]

    print(f"🚀 Launching {species}...")
    start_time = time.time()

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=TIMEOUT,
            check=True
        )
        execution_time = time.time() - start_time
        print(f"✅ {species} completed in {execution_time:.1f}s")
        return result.stdout, execution_time

    except subprocess.TimeoutExpired:
        print(f"❌ {species} timed out after {TIMEOUT}s")
        raise
    except subprocess.CalledProcessError as e:
        print(f"❌ {species} failed: {e}")
        print(f"stderr: {e.stderr}")
        raise


def parse_cycles(stdout: str) -> list:
    """Extract cycle JSON objects from stdout."""
    cycles = []
    for line in stdout.split('\n'):
        line = line.strip()
        if line.startswith('{') and '"cycle"' in line:
            try:
                data = json.loads(line)
                if 'cycle' in data:
                    cycles.append(data)
            except json.JSONDecodeError:
                continue
    return cycles


def compute_summary(cycles: list, species: str, exec_time: float) -> dict:
    """Compute summary statistics from cycles."""
    if not cycles:
        return None

    evals = [c for c in cycles if 'evaluation' in c]
    if not evals:
        return None

    avg_h = sum(e['evaluation'].get('h', 0) for e in evals) / len(evals)
    avg_w = sum(e['evaluation'].get('w', 0) for e in evals) / len(evals)
    avg_d = sum(e['evaluation'].get('d', 0) for e in evals) / len(evals)

    return {
        "species": species,
        "model": MODEL,
        "cycles": len(cycles),
        "evaluations": len(evals),
        "avgH": round(avg_h, 2),
        "avgW": round(avg_w, 2),
        "avgD": round(avg_d, 2),
        "executionTime": round(exec_time, 1),
        "finalEnergy": cycles[-1].get('energy', '?'),
        "returnReason": cycles[-1].get('returnReason', 'unknown')
    }


def main():
    print(f"=== qwen2.5:0.5b Model Comparison Test ===")
    print(f"Date: {datetime.now().isoformat()}")
    print(f"Species: {SPECIES}")
    print(f"Model: {MODEL}")
    print()

    results = []

    for species in SPECIES:
        try:
            stdout, exec_time = execute_phi_agent(species)
            cycles = parse_cycles(stdout)

            if not cycles:
                print(f"⚠️ {species}: No cycles parsed from output")
                continue

            summary = compute_summary(cycles, species, exec_time)
            if summary:
                results.append(summary)
                print(f"📊 {species}: {summary['evaluations']} evals, "
                      f"avgH={summary['avgH']}, avgW={summary['avgW']}, avgD={summary['avgD']}, "
                      f"time={summary['executionTime']}s")
            else:
                print(f"⚠️ {species}: No evaluations found")

        except Exception as e:
            print(f"❌ {species}: Error - {e}")
            continue

        print()

    # Save results
    output_file = Path(__file__).parent / "test-qwen2.5-0.5b" / "test_results.json"
    output_file.parent.mkdir(exist_ok=True)

    with open(output_file, 'w') as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "model": MODEL,
            "results": results
        }, f, indent=2)

    print(f"✅ Results saved to {output_file}")

    # Print summary table
    print("\n=== Summary Table ===\n")
    print(f"{'Species':<12} {'Time(s)':<10} {'Cycles':<8} {'Evals':<8} {'avgH':<8} {'avgW':<8} {'avgD':<8}")
    print("-" * 70)
    for r in results:
        print(f"{r['species']:<12} {r['executionTime']:<10} {r['cycles']:<8} "
              f"{r['evaluations']:<8} {r['avgH']:<8} {r['avgW']:<8} {r['avgD']:<8}")

    # Check species differences
    if len(results) == 4:
        balanced = next(r for r in results if r['species'] == 'balanced')
        hunter = next(r for r in results if r['species'] == 'hunter')
        scholar = next(r for r in results if r['species'] == 'scholar')

        print("\n=== Species Differences ===\n")
        print(f"hunter avgH vs balanced: {hunter['avgH']} - {balanced['avgH']} = {hunter['avgH'] - balanced['avgH']:.2f}")
        print(f"scholar avgW vs balanced: {scholar['avgW']} - {balanced['avgW']} = {scholar['avgW'] - balanced['avgW']:.2f}")

        if hunter['avgH'] > balanced['avgH'] and scholar['avgW'] > balanced['avgW']:
            print("\n✅ Species differences detected! Personality emerges with 0.5B model.")
        else:
            print("\n⚠️ Species differences weak or absent. May need prompt tuning.")


if __name__ == "__main__":
    main()
