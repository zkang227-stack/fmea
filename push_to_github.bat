@echo off
title Uploading FMEA Portal to GitHub (zkang227-stack/fmea)
color 0A
cls

cd /d "C:\work\FMEA"

echo ==============================================================================
echo          UPLOADING FMEA PORTAL TO GITHUB (zkang227-stack/fmea)
echo ==============================================================================
echo.

"C:\Program Files\Git\bin\git.exe" remote remove origin 2>nul
"C:\Program Files\Git\bin\git.exe" remote add origin https://github.com/zkang227-stack/fmea.git
"C:\Program Files\Git\bin\git.exe" branch -M main 2>nul
"C:\Program Files\Git\bin\git.exe" add index.html style.css app.js sync.js database.html review.html fmea.html adhesive_guide_banner.jpg .gitignore
"C:\Program Files\Git\bin\git.exe" commit -m "FMEA Portal Complete Upload" 2>nul

echo Pushing all files to https://github.com/zkang227-stack/fmea ...
echo.
echo NOTE: If a browser window pops up asking to "Sign in to GitHub",
echo       just click "Sign in with your browser" / "Authorize"!
echo.

"C:\Program Files\Git\bin\git.exe" push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ==============================================================================
    echo   [SUCCESS] ALL FILES ARE NOW IN YOUR GITHUB REPOSITORY!
    echo ==============================================================================
    echo.
    echo   Opening GitHub repository in your browser...
    start https://github.com/zkang227-stack/fmea
) else (
    echo.
    echo ==============================================================================
    echo   [NOTICE] If you need to authorize, please complete the login in your browser.
    echo ==============================================================================
)

echo.
pause
