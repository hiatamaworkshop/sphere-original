#!/bin/bash

# ============================================================
# Sphere Project - Unified CLI
# ============================================================
# Usage: ./sphere.sh [command] [args]
#
# Commands:
#   start        - Start Periphery server
#   stop         - Stop all Sphere services
#   batch        - Inject test data (60 items)
#   contribute   - Inject test data (15 items)
#   swarm [n]    - Run swarm agents (default: 3)
#   explore      - Run 3-layer exploration
#   resonance    - Run spectral link test
#   full         - batch + explore
#   status       - Show server endpoints
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PERIPHERY="$SCRIPT_DIR/docker_compose_sphere_v1/services/periphery"

show_help() {
    echo ""
    echo "========================================"
    echo "  Sphere CLI"
    echo "========================================"
    echo ""
    echo "Commands:"
    echo "  start          Start Periphery server"
    echo "  stop           Stop all Sphere services"
    echo "  status         Show server endpoints"
    echo "  batch          Inject test data (60 items)"
    echo "  contribute     Inject test data (15 items)"
    echo "  swarm [n]      Run swarm agents (default: 3)"
    echo "  explore        Run 3-layer exploration"
    echo "  resonance      Run spectral link test"
    echo "  full           batch + explore"
    echo ""
    echo "Examples:"
    echo "  ./sphere.sh start          Start the server"
    echo "  ./sphere.sh swarm 10       Run 10 swarm agents"
    echo "  ./sphere.sh batch          Inject all test data"
    echo ""
}

show_status() {
    echo ""
    echo "========================================"
    echo "  Sphere Server Status"
    echo "========================================"
    echo ""
    echo "  HTTP:      http://localhost:3001"
    echo "  WebSocket: ws://localhost:8081"
    echo ""
    echo "  Endpoints:"
    echo "    GET  /health            Health check"
    echo "    GET  /nodes             List nodes"
    echo "    GET  /nodes/stats       Statistics"
    echo "    POST /sphere/contribute External contribution"
    echo "    POST /dive/request      Request Dive Ticket"
    echo ""
}

case "$1" in
    ""|"help"|"-h"|"--help")
        show_help
        ;;

    "start")
        echo "[Sphere] Checking dependencies..."
        if [ ! -d "$PERIPHERY/node_modules" ]; then
            echo "[Sphere] Installing dependencies..."
            cd "$PERIPHERY" && npm install
        fi
        echo "[Sphere] Starting Periphery server..."
        cd "$PERIPHERY" && npm run dev &
        sleep 3
        show_status
        ;;

    "stop")
        echo "[Sphere] Stopping services..."
        pkill -f "tsx.*src/index.ts" 2>/dev/null || true
        echo "[Sphere] All services stopped."
        ;;

    "status")
        show_status
        ;;

    "batch")
        echo "[Sphere] Injecting all test data (60 items)..."
        cd "$PERIPHERY" && npm run contribute:batch
        ;;

    "contribute")
        echo "[Sphere] Injecting test data (15 items)..."
        cd "$PERIPHERY" && npm run contribute
        ;;

    "swarm")
        echo "[Sphere] Spawning agents..."
        cd "$PERIPHERY"
        if [ -z "$2" ]; then
            npm run swarm
        else
            npx tsx src/mock/swarm-agent.ts -n "$2"
        fi
        ;;

    "explore")
        echo "[Sphere] Running 3-layer exploration..."
        cd "$PERIPHERY" && npm run explore
        ;;

    "resonance")
        echo "[Sphere] Running resonance test..."
        cd "$PERIPHERY" && npm run resonance
        ;;

    "full")
        echo ""
        echo "========================================"
        echo "  Full Test Sequence"
        echo "========================================"
        echo ""
        echo "[1/2] Injecting test data..."
        cd "$PERIPHERY" && npm run contribute:batch
        echo ""
        echo "[2/2] Running exploration..."
        sleep 2
        npm run explore
        echo ""
        echo "[Done] Full test sequence completed."
        ;;

    *)
        echo "Unknown command: $1"
        echo "Run './sphere.sh help' for usage."
        exit 1
        ;;
esac
