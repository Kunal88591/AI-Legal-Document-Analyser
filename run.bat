@echo off
title AI Legal Document Analyser - Launcher
cd /d "%~dp0"

:: Run PowerShell launcher with bypassed execution policy
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-project.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo An error occurred while launching the project.
    pause
)
