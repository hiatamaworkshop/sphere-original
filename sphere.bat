@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM Sphere Project - Docker Compose CLI
REM ============================================================
REM Usage: sphere.bat [command] [args]
REM
REM Commands:
REM   up           - Start all services (core + agents)
REM   core         - Start core only (periphery + infra)
REM   down         - Stop all services
REM   build        - Rebuild all images
REM   ps           - Show service status
REM   logs [svc]   - Follow logs (optional: service name)
REM   batch        - Inject test data (60 items)
REM   contribute n - Inject n items
REM   wave [n] [ms]- Wave inject
REM   explore      - Run 3-layer exploration
REM   full         - batch + explore
REM ============================================================

set "SPHERE_ROOT=%~dp0"
set "COMPOSE=%SPHERE_ROOT%docker_compose_sphere_v1"
set DC=docker compose -f "%COMPOSE%\docker-compose.yml"

if "%1"=="" goto interactive
if "%1"=="help" goto help
if "%1"=="-h" goto help
if "%1"=="--help" goto help

if "%1"=="up" goto up_all
if "%1"=="core" goto up_core
if "%1"=="down" goto down
if "%1"=="build" goto build
if "%1"=="ps" goto ps
if "%1"=="status" goto ps
if "%1"=="logs" goto logs
if "%1"=="batch" goto batch
if "%1"=="contribute" goto contribute
if "%1"=="wave" goto wave
if "%1"=="explore" goto explore
if "%1"=="full" goto full

echo Unknown command: %1
echo Run 'sphere.bat help' for usage.
exit /b 1

:interactive
echo.
echo ========================================
echo   Sphere CLI (Docker Compose)
echo ========================================
echo.
echo   [1] up         - Start all services
echo   [2] core       - Start core only
echo   [3] down       - Stop all services
echo   [4] build      - Rebuild images
echo   [5] batch      - Inject test data
echo   [6] contribute - Inject custom count
echo   [7] explore    - Run exploration
echo   [8] full       - batch + explore
echo   [0] ps         - Show status
echo   [l] logs       - Follow logs
echo   [q] quit
echo.
set /p choice="Select: "

if "%choice%"=="1" goto up_all
if "%choice%"=="2" goto up_core
if "%choice%"=="3" goto down
if "%choice%"=="4" goto build
if "%choice%"=="5" goto batch
if "%choice%"=="6" goto contribute
if "%choice%"=="7" goto explore
if "%choice%"=="8" goto full
if "%choice%"=="0" goto ps
if "%choice%"=="l" goto logs
if "%choice%"=="L" goto logs
if "%choice%"=="q" exit /b 0
if "%choice%"=="Q" exit /b 0

echo Invalid choice.
goto interactive

:help
echo.
echo ========================================
echo   Sphere CLI (Docker Compose)
echo ========================================
echo.
echo Service commands:
echo   up             Start all services (core + agent profile)
echo   core           Start core only (periphery, postgres, redis, minio, nginx)
echo   down           Stop all services
echo   build          Rebuild all Docker images
echo   ps             Show running services
echo   logs [service] Follow logs (e.g., sphere logs phi-agent)
echo.
echo Data commands:
echo   batch          Inject all test data (60 items)
echo   contribute [n] Inject n items (interactive if no count)
echo   wave [n] [ms]  Wave inject (default: 50 items, 3000ms delay)
echo   explore        Run 3-layer exploration
echo   full           batch + explore
echo.
echo Services:
echo   periphery      Sphere core (HTTP :3001)
echo   ollama         LLM inference (:11434)
echo   phi-agent      Autonomous explorer (daemon)
echo   explorers      Gradio UI (:7860)
echo   digestor       Species memory (:5000)
echo   pool-service   External intake (:4000)
echo.
echo Examples:
echo   sphere up              Start everything
echo   sphere logs phi-agent  Follow phi-agent logs
echo   sphere contribute 10   Inject 10 items
echo   sphere build           Rebuild after code changes
echo.
pause
exit /b 0

:up_all
echo [Sphere] Starting all services...
%DC% --profile agent up -d
echo.
echo [Sphere] Services:
echo   Periphery:  http://localhost:3001
echo   Explorers:  http://localhost:7860
echo   Pool:       http://localhost:4000
echo   Digestor:   http://localhost:5000
echo   MinIO:      http://localhost:9001
echo.
pause
exit /b 0

:up_core
echo [Sphere] Starting core services...
%DC% up -d
echo.
echo [Sphere] Core ready: http://localhost:3001
echo.
pause
exit /b 0

:down
echo [Sphere] Stopping all services...
%DC% --profile agent down
echo [Sphere] All services stopped.
pause
exit /b 0

:build
echo [Sphere] Rebuilding all images...
%DC% --profile agent build
echo [Sphere] Build complete.
pause
exit /b 0

:ps
echo.
%DC% --profile agent ps
echo.
pause
exit /b 0

:logs
if not "%2"=="" (
    %DC% logs -f %2
) else (
    %DC% --profile agent logs -f --tail=50
)
exit /b 0

:batch
echo [Sphere] Injecting all test data...
%DC% exec periphery node dist/mock/contribution.js batch
pause
exit /b 0

:contribute
if not "%2"=="" (
    echo [Sphere] Injecting %2 items...
    %DC% exec periphery node dist/mock/contribution.js %2
    pause
    exit /b 0
)
echo.
echo   Contribute - Select count:
echo   [1] 1 item
echo   [2] 10 items
echo   [3] 50 items
echo   [c] Custom count
echo   [b] Back
echo.
set /p contrib_choice="Select [1-3, c, b]: "

if "%contrib_choice%"=="1" (
    %DC% exec periphery node dist/mock/contribution.js 1
) else if "%contrib_choice%"=="2" (
    %DC% exec periphery node dist/mock/contribution.js 10
) else if "%contrib_choice%"=="3" (
    %DC% exec periphery node dist/mock/contribution.js 50
) else if "%contrib_choice%"=="c" (
    set /p custom_count="Enter count: "
    %DC% exec periphery node dist/mock/contribution.js !custom_count!
) else if "%contrib_choice%"=="b" (
    goto interactive
) else (
    echo Invalid choice.
    goto contribute
)
pause
exit /b 0

:wave
if not "%2"=="" (
    if not "%3"=="" (
        echo [Sphere] Wave inject: %2 items, %3ms delay...
        %DC% exec periphery node dist/mock/contribution.js wave %2 %3
    ) else (
        echo [Sphere] Wave inject: %2 items, 3000ms delay...
        %DC% exec periphery node dist/mock/contribution.js wave %2
    )
) else (
    echo [Sphere] Wave inject: 50 items, 3000ms delay...
    %DC% exec periphery node dist/mock/contribution.js wave
)
pause
exit /b 0

:explore
echo [Sphere] Running 3-layer exploration...
%DC% exec periphery node dist/mock/explore-agent.js
pause
exit /b 0

:full
echo.
echo ========================================
echo   Full Test Sequence
echo ========================================
echo.
echo [1/2] Injecting test data...
%DC% exec periphery node dist/mock/contribution.js batch
echo.
echo [2/2] Running exploration...
timeout /t 2 /nobreak > nul
%DC% exec periphery node dist/mock/explore-agent.js
echo.
echo [Done] Full test sequence completed.
pause
exit /b 0
