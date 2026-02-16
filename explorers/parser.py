"""
phi-agent Output Parser

Extracts cycle data from phi-agent stdout.
Handles both structured JSON output and text-based logs.
"""

import re
import json
from typing import List, Dict, Any, Optional


def parse_cycles(stdout: str) -> List[Dict[str, Any]]:
    """
    Parse phi-agent stdout and extract cycle data.

    Expected format (one JSON object per cycle):
    {
      "cycle": 1,
      "action": "sense",
      "position": [...],
      "energy": 85,
      "nearbyNodes": [...],
      "focused": {...},
      "evaluation": {...},
      "feelings": {...},
      "deltaProfile": {...}
    }

    Args:
        stdout: phi-agent stdout text

    Returns:
        List of cycle dictionaries
    """
    cycles = []

    # Try to find JSON objects in stdout
    # Look for lines that start with { and contain "cycle"
    for line in stdout.split('\n'):
        line = line.strip()
        if line.startswith('{') and '"cycle"' in line:
            try:
                data = json.loads(line)
                if 'cycle' in data:
                    cycles.append(data)
            except json.JSONDecodeError:
                continue

    # If no JSON found, try text parsing (fallback)
    if not cycles:
        cycles = parse_cycles_text(stdout)

    return cycles


def parse_cycles_text(stdout: str) -> List[Dict[str, Any]]:
    """
    Fallback text parser for non-JSON output.
    Extracts cycle numbers, actions, and basic stats.

    Args:
        stdout: phi-agent stdout text

    Returns:
        List of cycle dictionaries (partial data)
    """
    cycles = []

    # Pattern: Cycle N: action_name
    cycle_pattern = re.compile(r'Cycle\s+(\d+):\s+(\w+)', re.IGNORECASE)
    energy_pattern = re.compile(r'energy[:\s]+(\d+)', re.IGNORECASE)

    lines = stdout.split('\n')
    current_cycle = None

    for line in lines:
        cycle_match = cycle_pattern.search(line)
        if cycle_match:
            if current_cycle:
                cycles.append(current_cycle)

            current_cycle = {
                'cycle': int(cycle_match.group(1)),
                'action': cycle_match.group(2).lower(),
                'text': line
            }

        if current_cycle:
            energy_match = energy_pattern.search(line)
            if energy_match:
                current_cycle['energy'] = int(energy_match.group(1))

    # Add last cycle
    if current_cycle:
        cycles.append(current_cycle)

    return cycles


def format_cycle_output(cycles: List[Dict[str, Any]]) -> str:
    """
    Format cycles into human-readable text.

    Args:
        cycles: List of cycle dictionaries

    Returns:
        Formatted text
    """
    if not cycles:
        return "No cycles found."

    lines = []

    for c in cycles:
        cycle_num = c.get('cycle', '?')
        action = c.get('action', 'unknown')
        energy = c.get('energy', '?')

        line = f"**Cycle {cycle_num}**: {action} (energy: {energy})"

        # Add nearby count
        nearby = c.get('nearbyNodes', [])
        if nearby:
            # nearbyNodes can be int (count) or list (nodes)
            count = len(nearby) if isinstance(nearby, list) else nearby
            line += f" — {count} nodes nearby"

        # Add focused node info
        focused = c.get('focused')
        if focused:
            node_id = focused.get('nodeId', 'unknown')[:8]
            tags = focused.get('tags', [])
            line += f"\n  → Focus: {node_id}... {tags[:3]}"

        # Add evaluation
        evaluation = c.get('evaluation')
        if evaluation:
            h = evaluation.get('h', '?')
            w = evaluation.get('w', '?')
            d = evaluation.get('d', '?')
            line += f"\n  → Eval: h={h}, w={w}, d={d}"

        # Add feelings
        feelings = c.get('feelings')
        if feelings:
            sat = feelings.get('satisfaction', 0)
            frust = feelings.get('frustration', 0)
            stam = feelings.get('stamina', 0)
            stale = feelings.get('staleness', 0)
            line += f"\n  → Feel: sat={sat:.2f}, frust={frust:.2f}, stam={stam:.2f}, stale={stale:.2f}"

        lines.append(line)

    return "\n\n".join(lines)


def format_summary(cycles: List[Dict[str, Any]], species: str) -> str:
    """
    Generate summary statistics from cycles.

    Args:
        cycles: List of cycle dictionaries
        species: Species name

    Returns:
        Summary text
    """
    if not cycles:
        return "No data to summarize."

    total_cycles = len(cycles)

    # Count actions
    actions = {}
    for c in cycles:
        action = c.get('action', 'unknown')
        actions[action] = actions.get(action, 0) + 1

    # Count evaluations
    evals = [c for c in cycles if 'evaluation' in c]
    total_evals = len(evals)

    # Average h/w/d if available
    if evals:
        avg_h = sum(e['evaluation'].get('h', 0) for e in evals) / total_evals
        avg_w = sum(e['evaluation'].get('w', 0) for e in evals) / total_evals
        avg_d = sum(e['evaluation'].get('d', 0) for e in evals) / total_evals
    else:
        avg_h = avg_w = avg_d = 0

    # Final energy
    last_cycle = cycles[-1]
    final_energy = last_cycle.get('energy', '?')

    # Build summary
    lines = [
        f"**Species**: {species}",
        f"**Total Cycles**: {total_cycles}",
        f"**Actions**: {', '.join(f'{k}({v})' for k, v in actions.items())}",
        f"**Evaluations**: {total_evals}",
        f"**Avg Scores**: h={avg_h:.1f}, w={avg_w:.1f}, d={avg_d:.1f}",
        f"**Final Energy**: {final_energy}"
    ]

    # Termination reason (if available)
    if 'returnReason' in last_cycle:
        lines.append(f"**Return Reason**: {last_cycle['returnReason']}")

    return "\n".join(lines)


def format_combined_output(cycles: List[Dict[str, Any]], species: str) -> str:
    """
    Combine summary and cycle details into one output.

    Args:
        cycles: List of cycle dictionaries
        species: Species name

    Returns:
        Combined text (summary + separator + cycles)
    """
    summary = format_summary(cycles, species)
    cycles_text = format_cycle_output(cycles)

    separator = "─" * 50

    return f"{summary}\n\n{separator}\n\n{cycles_text}"


def extract_narrative(stdout: str) -> str:
    """
    Extract narrative from phi-agent stdout.

    Expected markers:
      == NARRATIVE START ==
      {narrative text}
      == NARRATIVE END ==

    Args:
        stdout: phi-agent stdout text

    Returns:
        Extracted narrative or fallback message
    """
    start_marker = "== NARRATIVE START =="
    end_marker = "== NARRATIVE END =="

    start_idx = stdout.find(start_marker)
    end_idx = stdout.find(end_marker)

    if start_idx == -1 or end_idx == -1:
        return "*No narrative generated (RESPONSE=false)*"

    narrative = stdout[start_idx + len(start_marker):end_idx].strip()

    return narrative if narrative else "*Narrative is empty*"


def extract_broadcast(stdout: str) -> list:
    """
    Extract broadcast posts from phi-agent stdout.

    Expected markers:
      == BROADCAST START ==
      --- 1/3 ---
      {post text}
      --- 2/3 ---
      {post text}
      == BROADCAST END ==

    Args:
        stdout: phi-agent stdout text

    Returns:
        List of post strings, or empty list if no broadcast found
    """
    start_marker = "== BROADCAST START =="
    end_marker = "== BROADCAST END =="

    start_idx = stdout.find(start_marker)
    end_idx = stdout.find(end_marker)

    if start_idx == -1 or end_idx == -1:
        return []

    block = stdout[start_idx + len(start_marker):end_idx].strip()
    posts = []
    current = []

    for line in block.split('\n'):
        line = line.strip()
        if re.match(r'^--- \d+/\d+ ---$', line):
            if current:
                posts.append('\n'.join(current))
                current = []
        elif line:
            current.append(line)

    if current:
        posts.append('\n'.join(current))

    return posts
