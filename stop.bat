@echo off
title AI Legal Document Analyser - Stop
color 0c
echo =====================================================================
echo           AI LEGAL DOCUMENT ANALYSER - STOP SERVICES                
echo =====================================================================
echo.

cd /d "%~dp0"
echo [*] Stopping and removing all Docker containers...
docker compose down
echo.
echo [+] All services have been stopped.
echo.
pause
