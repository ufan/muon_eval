@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -BindAddress 127.0.0.1 -Port 8765 -OpenBrowser
if errorlevel 1 pause
