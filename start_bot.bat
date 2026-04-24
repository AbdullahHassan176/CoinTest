@echo off
title HORMUZ Bot
echo =======================================
echo   HORMUZ RSS Aggregator Bot
echo =======================================

cd /d "%~dp0bot"

:loop
echo [%date% %time%] Starting bot...
python main.py
echo.
echo [%date% %time%] Bot stopped (exit code %errorlevel%). Restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto loop
