@echo off
setlocal
chcp 65001 >nul
title osu! Map Roulette

cd /d "%~dp0"

if exist "dist\osu! Map Roulette\osu! Map Roulette.exe" (
    start "" "dist\osu! Map Roulette\osu! Map Roulette.exe"
    exit /b 0
)

set "PYTHON_EXE=C:\Users\lelya\AppData\Local\Programs\Python\Python311\python.exe"

if not exist "%PYTHON_EXE%" (
    where python >nul 2>nul
    if %errorlevel% equ 0 (
        set "PYTHON_EXE=python"
    ) else (
        echo [ERROR] Python was not found on PATH!
        pause
        exit /b 1
    )
)

"%PYTHON_EXE%" main.py

if %errorlevel% neq 0 (
    echo.
    echo Application exited with code %errorlevel%.
    pause
)
endlocal
