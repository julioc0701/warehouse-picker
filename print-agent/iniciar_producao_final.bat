@echo off
title Agente Producao NVS (Executavel)
cd /d "%~dp0"

:: ---------------------------------------------------------------------
:: Configurações de conexão para o seu servidor Railway:
:: ---------------------------------------------------------------------
set ENABLE_POLLING=1
set BACKEND_URL=https://nvs-producao.up.railway.app/api
set POLL_INTERVAL=3

echo ==========================================================
echo  Iniciando Agente de Producao NVS v1.4 (Otimizado)
echo  Conectando em: %BACKEND_URL%
echo ==========================================================
echo.

:: Tenta rodar o EXECUTAVEL ZebraAgent-WP.exe
if exist ZebraAgent-WP.exe (
    ZebraAgent-WP.exe
) else (
    echo [ERRO] Nao encontrei o arquivo ZebraAgent-WP.exe nesta pasta.
    echo Por favor, coloque o executavel e este .bat juntos.
)

pause
