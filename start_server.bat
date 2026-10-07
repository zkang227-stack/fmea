@echo off
title Adhesive FMEA Portal - Real-Time Team Server
color 0A
cls

echo ==============================================================================
echo           ADHESIVE FMEA ENTERPRISE PORTAL - REAL-TIME TEAM SERVER
echo ==============================================================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found on your system!
    echo Please install Node.js from https://nodejs.org/ to run the team server.
    echo.
    pause
    exit /b
)

:: Get Wi-Fi / Local Network IPv4 Address
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike '*Loopback*' -and $_.IPAddress -notlike '169.254*' -and $_.IPAddress -notlike '127.*' } | Select-Object -First 1).IPAddress"') do set LAN_IP=%%i

echo  [OK] Node.js detected.
echo  [OK] Bundling all-in-one standalone file (fmea.html)...
call node build_bundle.js >nul 2>&1
echo  [OK] Initializing Live Team Sync Company Server...
echo.
echo ==============================================================================
echo   HOW TO SHARE WITH YOUR TEAM (Company Network / Wi-Fi):
echo ==============================================================================
if defined LAN_IP (
    echo   👉 Share this link with your team:   http://%LAN_IP%:3000
)
echo   👉 Or share by computer name:        http://DESKTOP-BQDL6ES:3000
echo   👉 Local computer access:            http://localhost:3000
echo.
echo   👉 Direct Standalone File:           fmea.html
echo      (You can also directly send the file fmea.html via email or Teams)
echo.
echo   * When anyone edits through the link, all data updates LIVE for everyone!
==============================================================================
echo.
echo  Starting server and launching browser...
echo.

:: Automatically open default browser after a 2-second pause
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

:: Start Node.js server
node server.js

pause
