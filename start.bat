@echo off
chcp 65001 >nul
title VPS Order Hub
cd /d "%~dp0"
echo ==============================================
echo   VPS Order Hub - He thong dat hang HP
echo   Truy cap: http://localhost:3000
echo ==============================================
start "" http://localhost:3000
node src/server.js
pause
