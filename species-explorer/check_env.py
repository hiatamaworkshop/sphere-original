#!/usr/bin/env python3
"""
Environment checker for Species Explorer

Verifies that Docker, phi-agent image, and Sphere API are available.
"""

import subprocess
import sys
import os
import urllib.request
import urllib.error


def check_docker():
    """Check if Docker is available."""
    try:
        result = subprocess.run(
            ["docker", "version"],
            capture_output=True,
            timeout=5,
            check=False
        )
        if result.returncode == 0:
            print("✅ Docker is available")
            return True
        else:
            print("❌ Docker is not responding")
            return False
    except (FileNotFoundError, subprocess.TimeoutExpired):
        print("❌ Docker is not installed or not in PATH")
        return False


def check_phi_agent_image():
    """Check if phi-agent:latest image exists."""
    try:
        result = subprocess.run(
            ["docker", "images", "-q", "phi-agent:latest"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False
        )
        if result.stdout.strip():
            print("✅ phi-agent:latest image exists")
            return True
        else:
            print("❌ phi-agent:latest image not found")
            print("   Build it with: cd phi-agent && docker build -t phi-agent:latest .")
            return False
    except (FileNotFoundError, subprocess.TimeoutExpired):
        print("❌ Cannot check Docker images")
        return False


def check_sphere_api(url):
    """Check if Sphere API is reachable."""
    try:
        # Try /health endpoint
        health_url = f"{url}/health" if not url.endswith("/health") else url
        req = urllib.request.Request(health_url)
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                print(f"✅ Sphere API is reachable at {url}")
                return True
            else:
                print(f"⚠️  Sphere API returned status {response.status}")
                return False
    except urllib.error.URLError as e:
        print(f"❌ Sphere API not reachable at {url}")
        print(f"   Error: {e.reason}")
        return False
    except Exception as e:
        print(f"❌ Cannot reach Sphere API: {e}")
        return False


def check_ollama(host):
    """Check if Ollama is reachable."""
    try:
        # Ollama API endpoint
        api_url = f"{host}/api/tags"
        req = urllib.request.Request(api_url)
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                print(f"✅ Ollama is reachable at {host}")
                return True
            else:
                print(f"⚠️  Ollama returned status {response.status}")
                return False
    except urllib.error.URLError as e:
        print(f"⚠️  Ollama not reachable at {host}")
        print(f"   Note: This is expected if Ollama is only accessible from inside Docker")
        print(f"   Error: {e.reason}")
        return False
    except Exception as e:
        print(f"⚠️  Cannot reach Ollama: {e}")
        return False


def main():
    print("=" * 60)
    print("Species Explorer — Environment Check")
    print("=" * 60)
    print()

    # Get config from env
    sphere_url = os.getenv("SPHERE_URL", "http://localhost:3001")
    ollama_host = os.getenv("OLLAMA_HOST", "http://host.docker.internal:11434")

    print(f"Configuration:")
    print(f"  SPHERE_URL:   {sphere_url}")
    print(f"  OLLAMA_HOST:  {ollama_host}")
    print()

    # Run checks
    checks = [
        ("Docker", check_docker()),
        ("phi-agent Image", check_phi_agent_image()),
        ("Sphere API", check_sphere_api(sphere_url)),
        ("Ollama (optional)", check_ollama(ollama_host)),
    ]

    print()
    print("=" * 60)
    print("Summary:")
    print("=" * 60)

    all_passed = True
    for name, passed in checks[:3]:  # First 3 are required
        status = "✅" if passed else "❌"
        print(f"{status} {name}")
        if not passed and name != "Ollama (optional)":
            all_passed = False

    # Ollama is optional (checked from inside Docker)
    ollama_status = "✅" if checks[3][1] else "⚠️"
    print(f"{ollama_status} Ollama (optional — verified from inside Docker container)")

    print()

    if all_passed:
        print("✅ All required checks passed. You can run:")
        print("   python app.py")
        return 0
    else:
        print("❌ Some checks failed. Please fix the issues above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
