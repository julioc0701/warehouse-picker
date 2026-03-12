@echo off
:: =====================================================================
:: CONFIGURAÇÕES DO AGENTE DE IMPRESSÃO ZEBRA
:: Edite este arquivo apenas se necessário.
:: =====================================================================

:: Nome exato da impressora no Windows.
:: Deixe VAZIO para detecção automática (recomendado).
:: Exemplo: set PRINTER_NAME=ZDesigner ZD220-203dpi ZPL
set PRINTER_NAME=

:: URL do backend (Railway em produção ou local para testes).
:: Deixe VAZIO para usar o padrão: http://localhost:8001/api
:: Exemplo: set BACKEND_URL=https://meu-app.up.railway.app/api
set BACKEND_URL=
