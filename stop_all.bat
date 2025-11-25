@echo off
setlocal enableextensions
cd /d "%~dp0"

echo Encerrando janelas do sistema...
powershell -ExecutionPolicy Bypass -Command "Get-Process | Where-Object {$_.MainWindowTitle -eq 'MQTT Broker'}   | Stop-Process -Force"
powershell -ExecutionPolicy Bypass -Command "Get-Process | Where-Object {$_.MainWindowTitle -eq 'Backend'}        | Stop-Process -Force"
powershell -ExecutionPolicy Bypass -Command "Get-Process | Where-Object {$_.MainWindowTitle -eq 'Simulator'}      | Stop-Process -Force"
powershell -ExecutionPolicy Bypass -Command "Get-Process | Where-Object {$_.MainWindowTitle -eq 'Dashboard'}      | Stop-Process -Force"

echo Tentando encerrar processos residuais do broker (node broker.js)...
powershell -ExecutionPolicy Bypass -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*node*' } | Stop-Process -Force"

echo Pronto.
exit /b 0
