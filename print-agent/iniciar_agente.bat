@echo off
title Agente de Impressao Zebra — Warehouse Picker
cd /d "%~dp0"

:: =====================================================================
:: URL do backend — aponte para o servidor de producao ou local
:: Producao Railway: https://SEU-APP.up.railway.app/api
:: Local:            http://localhost:8001/api
:: =====================================================================
if not defined BACKEND_URL (
    set BACKEND_URL=https://SEU-APP.up.railway.app/api
)

echo.
echo  Backend URL  : %BACKEND_URL%
echo.

echo  Verificando dependencias...
python -c "import win32print" 2>nul
if errorlevel 1 (
    echo  [AVISO] pywin32 nao encontrado. Instalando...
    pip install pywin32
    echo.
)

echo  Iniciando agente...
python agent.py
pause
