"""
phi-agent Docker Executor

Spawns phi-agent containers and captures stdout.
"""

import subprocess
import shlex
from typing import Optional


def execute_phi_agent(
    loadout: str,
    query: str,
    sphere_url: str,
    ollama_host: str,
    model: str = "llama3.2:1b",
    timeout: int = 300
) -> str:
    """
    Execute phi-agent as a Docker container.

    Args:
        loadout: Species name (e.g., "wanderer")
        query: Search query
        sphere_url: Sphere API endpoint
        ollama_host: Ollama API endpoint (must be accessible from Docker)
        model: Ollama model name
        timeout: Max execution time in seconds

    Returns:
        stdout as string

    Raises:
        subprocess.CalledProcessError: If Docker command fails
        subprocess.TimeoutExpired: If execution exceeds timeout
    """

    # Build Docker command
    cmd = [
        "docker", "run", "--rm",
        "-e", f"LOADOUT={loadout}",
        "-e", f"QUERY={query}",
        "-e", f"SPHERE_URL={sphere_url}",
        "-e", f"OLLAMA_HOST={ollama_host}",
        "-e", f"OLLAMA_MODEL={model}",
        "-e", "DAEMON=false",
        "phi-agent:latest"
    ]

    # Execute
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=True
    )

    return result.stdout


def check_docker_available() -> bool:
    """
    Check if Docker is available.

    Returns:
        True if Docker is available, False otherwise
    """
    try:
        subprocess.run(
            ["docker", "version"],
            capture_output=True,
            timeout=5,
            check=True
        )
        return True
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
        return False


def check_phi_agent_image() -> bool:
    """
    Check if phi-agent:latest image exists.

    Returns:
        True if image exists, False otherwise
    """
    try:
        result = subprocess.run(
            ["docker", "images", "-q", "phi-agent:latest"],
            capture_output=True,
            text=True,
            timeout=5,
            check=True
        )
        return bool(result.stdout.strip())
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
        return False
