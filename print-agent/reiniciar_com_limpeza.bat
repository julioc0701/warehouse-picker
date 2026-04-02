@echo off
title Reiniciar Producao Completo - NVS
cd /d "%~dp0"

:: Verifica privilégios de Administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERRO] Este script precisa ser executado como ADMINISTRADOR.
    echo Por favor, clique com o botao direito e selecione "Executar como administrador".
    pause
    exit /b 1
)

echo ==========================================================
echo  REINICIANDO SISTEMA DE IMPRESSAO (LIMPEZA + AGENTE)
echo ==========================================================
echo.

echo [1/4] Parando Spooler de Impressao...
net stop spooler /y >nul 2>&1
taskkill /F /IM spoolsv.exe /T >nul 2>&1

echo [2/4] Limpando arquivos da fila...
del /Q /F /S "%systemroot%\System32\Spool\Printers\*.*" >nul 2>&1

echo [3/4] Reiniciando Spooler...
net start spooler >nul 2>&1
powershell -Command "Get-Printer | Where-Object {$_.JobCount -gt 0 -or $_.PrinterStatus -eq 'Offline'} | Set-Printer -IsOffline $false" >nul 2>&1

echo [4/4] Iniciando Agente ZEBRA em MODO PRODUCAO...
:: Configurações de Produção
set ENABLE_POLLING=1
set BACKEND_URL=https://nvs-producao.up.railway.app/api
set POLL_INTERVAL=2

if exist ZEBRA_INDUSTRIAL_V2.exe (
    echo Conectando em: %BACKEND_URL%
    ZEBRA_INDUSTRIAL_V2.exe
) else (
    echo [ERRO CRITICO] Executavel ZEBRA_INDUSTRIAL_V2.exe nao encontrado.
    pause
)
