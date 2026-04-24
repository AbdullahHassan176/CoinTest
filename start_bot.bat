@echo off
title HORMUZ Bot
echo =======================================
echo   HORMUZ RSS Aggregator Bot
echo =======================================

cd /d "%~dp0bot"

echo Killing any existing bot instances...
taskkill /F /FI "WINDOWTITLE eq HORMUZ Bot" /FI "IMAGENAME eq python.exe" >nul 2>&1
for /f "tokens=2" %%i in ('wmic process where "CommandLine like '%%main.py%%' and CommandLine not like '%%train%%'" get ProcessId ^| findstr /r "[0-9]"') do (
    taskkill /F /PID %%i >nul 2>&1
)
timeout /t 2 /nobreak >nul

:loop
echo [%date% %time%] Starting bot...
python main.py
echo.
echo [%date% %time%] Bot stopped (exit code %errorlevel%). Restarting in 10 seconds...
timeout /t 10 /nobreak >nul
goto loop
