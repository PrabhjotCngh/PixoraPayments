@echo off
REM Pixora Bridge Launcher
REM This script starts the Pixora Bridge service

echo ================================================
echo    Pixora Bridge - Starting...
echo ================================================
echo.

REM Check if bridge config exists
if not exist bridge-config.env (
    echo [WARNING] bridge-config.env not found!
    echo Creating from default template...
    copy bridge-config.default.env bridge-config.env
    echo.
    echo [IMPORTANT] Please edit bridge-config.env with your settings
    echo Press any key to open the config file...
    pause >nul
    notepad bridge-config.env
    echo.
)

echo Starting Pixora Bridge...
echo Keep this window open while using the photobooth
echo Close this window to stop the bridge
echo.
echo Press Ctrl+C to stop
echo ================================================
echo.

PixoraBridge.exe

echo.
echo Bridge stopped.
pause
