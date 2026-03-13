@echo off
title Agente Producao NVS
set ENABLE_POLLING=1
set BACKEND_URL=https://nvs-producao.up.railway.app/api
set POLL_INTERVAL=2
python agent.py
pause
