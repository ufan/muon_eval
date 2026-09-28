@echo off
setlocal
cd /d "%~dp0"
echo.
echo 将在本机所有网络接口的 8765 端口提供服务。
echo 首次运行时 Windows 防火墙可能询问是否允许访问，请仅勾选需要的网络类型。
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -BindAddress 0.0.0.0 -Port 8765
if errorlevel 1 pause
