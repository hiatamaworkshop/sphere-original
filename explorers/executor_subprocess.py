"""
phi-agent Subprocess Executor

Spawns phi-agent as a Node.js subprocess (no Docker required).
Used for HF Spaces deployment where phi-agent is bundled in the same container.
"""

import subprocess
import os
from typing import Optional


PHI_AGENT_DIR = os.environ.get("PHI_AGENT_DIR", "/app/phi-agent")


def execute_phi_agent(
    loadout: str,
    query: str,
    sphere_url: str,
    model: str = "llama-3.1-8b-instant",
    evaluate: bool = True,
    timeout: int = 300
) -> str:
    """
    Execute phi-agent as a Node.js subprocess.

    Args:
        loadout: Species name (e.g., "wanderer")
        query: Search query
        sphere_url: Sphere API endpoint
        model: Groq model ID (e.g., "llama-3.1-8b-instant")
        evaluate: Whether to evaluate nodes
        timeout: Max execution time in seconds

    Returns:
        stdout as string

    Raises:
        subprocess.TimeoutExpired: If execution exceeds timeout
        RuntimeError: If process exits with non-zero code
    """
    ws_url = sphere_url.replace("http://", "ws://").replace("https://", "wss://")

    env = {
        **os.environ,
        "LOADOUT": loadout,
        "SPHERE_URL": sphere_url,
        "SPHERE_WS": ws_url,
        "EVALUATE": "true" if evaluate else "false",
        "RESPONSE": "true",
        "DAEMON": "false",
        "SKIP_LAYERS": "true",
        "LLM_BACKEND": os.environ.get("LLM_BACKEND", "groq"),
        "GROQ_API_KEY": os.environ.get("GROQ_API_KEY", ""),
        "GROQ_MODEL": model,
    }

    entry_point = os.path.join(PHI_AGENT_DIR, "dist", "index.js")
    cmd = ["node", entry_point, query]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        env=env
    )

    # Include stderr in output for debugging if process failed
    if result.returncode != 0:
        combined = result.stdout + "\n[STDERR]\n" + result.stderr
        raise RuntimeError(f"phi-agent exited with code {result.returncode}:\n{combined[-2000:]}")

    return result.stdout


def check_node_available() -> bool:
    """Check if Node.js runtime is available."""
    try:
        subprocess.run(
            ["node", "--version"],
            capture_output=True,
            timeout=5,
            check=True
        )
        return True
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
        return False


def check_phi_agent_built() -> bool:
    """Check if phi-agent dist/ exists."""
    entry_point = os.path.join(PHI_AGENT_DIR, "dist", "index.js")
    return os.path.isfile(entry_point)
