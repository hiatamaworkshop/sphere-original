@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM Sphere Project - Unified CLI
REM ============================================================
REM Usage: sphere.bat [command] [args]
REM
REM Commands:
REM   start        - Start Periphery server
REM   stop         - Stop all Sphere services
REM   batch        - Inject test data (60 items)
REM   contribute [n] - Inject test data (1/10/50 or custom)
REM   wave [n] [ms]  - Wave inject (default: 50 items, 3s delay)
REM   swarm [n]    - Run swarm agents (default: 3)
REM   explore      - Run 3-layer exploration
REM   full         - batch + explore
REM   status       - Show server endpoints
REM ============================================================

set "SPHERE_ROOT=%~dp0"
set "PERIPHERY=%SPHERE_ROOT%docker_compose_sphere_v1\services\periphery"

if "%1"=="" goto interactive
if "%1"=="help" goto help
if "%1"=="-h" goto help
if "%1"=="--help" goto help

if "%1"=="start" goto start_server
if "%1"=="stop" goto stop_server
if "%1"=="status" goto show_status
if "%1"=="batch" goto batch
if "%1"=="contribute" goto contribute
if "%1"=="wave" goto wave
if "%1"=="swarm" goto swarm
if "%1"=="explore" goto explore
if "%1"=="full" goto full

echo Unknown command: %1
echo Run 'sphere.bat help' for usage.
exit /b 1

:interactive
echo.
echo ========================================
echo   Sphere CLI - Interactive Mode
echo ========================================
echo.
echo   [1] start       - Start Periphery server
echo   [2] stop        - Stop all services
echo   [3] batch       - Inject test data (60 items)
echo   [4] contribute  - Inject test data (1/10/50/custom)
echo   [5] wave        - Wave inject (staggered)
echo   [6] swarm       - Run swarm agents
echo   [7] explore     - Run 3-layer exploration
echo   [8] full        - batch + explore
echo   [0] status      - Show server status
echo   [q] quit
echo.
set /p choice="Select [0-8, q]: "

if "%choice%"=="1" goto start_server
if "%choice%"=="2" goto stop_server
if "%choice%"=="3" goto batch
if "%choice%"=="4" goto contribute
if "%choice%"=="5" goto wave
if "%choice%"=="6" goto swarm
if "%choice%"=="7" goto explore
if "%choice%"=="8" goto full
if "%choice%"=="0" goto show_status
if "%choice%"=="q" exit /b 0
if "%choice%"=="Q" exit /b 0

echo Invalid choice.
goto interactive

:help
echo.
echo ========================================
echo   Sphere CLI
echo ========================================
echo.
echo Commands:
echo   start          Start Periphery server
echo   stop           Stop all Sphere services
echo   status         Show server endpoints
echo   batch          Inject test data (60 items)
echo   contribute [n] Inject test data (1/10/50 or specify count)
echo   wave [n] [ms]  Wave inject (default: 50 items, 3000ms delay)
echo   swarm [n]      Run swarm agents (default: 3)
echo   explore        Run 3-layer exploration
echo   full           batch + explore
echo.
echo Examples:
echo   sphere start          Start the server
echo   sphere contribute 1   Inject 1 item
echo   sphere contribute 50  Inject 50 items
echo   sphere swarm 10       Run 10 swarm agents
echo   sphere wave 100 2000  Wave inject 100 items (2s delay)
echo   sphere batch          Inject all test data
echo.
pause
exit /b 0

:start_server
echo [Sphere] Checking dependencies...
if not exist "%PERIPHERY%\node_modules" (
    echo [Sphere] Installing dependencies...
    cd /d "%PERIPHERY%"
    call npm install
)
echo [Sphere] Starting Periphery server...
cd /d "%PERIPHERY%"
start "Sphere Periphery" cmd /k "npm run dev"
timeout /t 3 /nobreak > nul
goto show_status

:stop_server
echo [Sphere] Stopping services...
taskkill /FI "WINDOWTITLE eq Sphere Periphery*" /F 2>nul
taskkill /FI "WINDOWTITLE eq Mock Bot*" /F 2>nul
echo [Sphere] All services stopped.
pause
exit /b 0

:show_status
echo.
echo ========================================
echo   Sphere Server Status
echo ========================================
echo.
echo   HTTP:      http://localhost:3001
echo   WebSocket: ws://localhost:8081
echo.
echo   Endpoints:
echo     GET  /health            Health check
echo     GET  /metrics           System metrics
echo     GET  /nodes/metrics     List nodes with metrics
echo     GET  /nodes/stats       Statistics
echo     POST /sphere/contribute External contribution
echo     POST /dive/request      Request Dive Ticket
echo.
pause
exit /b 0

:batch
echo [Sphere] Injecting all test data (60 items)...
cd /d "%PERIPHERY%"
call npm run contribute:batch
pause
exit /b 0

:contribute
if not "%2"=="" (
    echo [Sphere] Injecting %2 items...
    cd /d "%PERIPHERY%"
    call npx tsx src/mock/contribution.ts %2
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
    echo [Sphere] Injecting 1 item...
    cd /d "%PERIPHERY%"
    call npx tsx src/mock/contribution.ts 1
) else if "%contrib_choice%"=="2" (
    echo [Sphere] Injecting 10 items...
    cd /d "%PERIPHERY%"
    call npx tsx src/mock/contribution.ts 10
) else if "%contrib_choice%"=="3" (
    echo [Sphere] Injecting 50 items...
    cd /d "%PERIPHERY%"
    call npx tsx src/mock/contribution.ts 50
) else if "%contrib_choice%"=="c" (
    set /p custom_count="Enter count: "
    echo [Sphere] Injecting !custom_count! items...
    cd /d "%PERIPHERY%"
    call npx tsx src/mock/contribution.ts !custom_count!
) else if "%contrib_choice%"=="b" (
    goto interactive
) else (
    echo Invalid choice.
    goto contribute
)
pause
exit /b 0

:wave
cd /d "%PERIPHERY%"
if not "%2"=="" (
    if not "%3"=="" (
        echo [Sphere] Wave inject: %2 items, %3ms delay...
        call npx tsx src/mock/contribution.ts wave %2 %3
    ) else (
        echo [Sphere] Wave inject: %2 items, 3000ms delay...
        call npx tsx src/mock/contribution.ts wave %2
    )
) else (
    echo [Sphere] Wave inject: 50 items, 3000ms delay...
    call npx tsx src/mock/contribution.ts wave
)
pause
exit /b 0

:swarm
echo [Sphere] Spawning agents...
cd /d "%PERIPHERY%"
if "%2"=="" (
    call npm run swarm
) else (
    call npx tsx src/mock/swarm-agent.ts -n %2
)
pause
exit /b 0

:explore
echo [Sphere] Running 3-layer exploration...
cd /d "%PERIPHERY%"
call npm run explore
pause
exit /b 0

:full
echo.
echo ========================================
echo   Full Test Sequence
echo ========================================
echo.
echo [1/2] Injecting test data...
cd /d "%PERIPHERY%"
call npm run contribute:batch
echo.
echo [2/2] Running exploration...
timeout /t 2 /nobreak > nul
call npm run explore
echo.
echo [Done] Full test sequence completed.
pause
exit /b 0
