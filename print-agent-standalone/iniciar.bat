@echo off
%SystemRoot%\System32\chcp.com 65001 >nul 2>&1
title Agente de Impressao Zebra — Warehouse Picker
cd /d "%~dp0"

:: ── Verificação de pré-requisitos ──────────────────────────────────
if not exist "python\python.exe" (
    echo.
    echo  ERRO: Python Embeddable nao encontrado.
    echo.
    echo  Execute "setup\montar_pacote.bat" para montar o pacote.
    echo  Ou fale com o suporte tecnico.
    echo.
    pause
    exit /b 1
)

if not exist "agent.py" (
    echo.
    echo  ERRO: agent.py nao encontrado na pasta.
    echo.
    echo  Execute "setup\montar_pacote.bat" para copiar o agent.py.
    echo.
    pause
    exit /b 1
)

:: ── Carregar configurações ────────────────────────────────────────
if exist "config.bat" call config.bat

:: ── Iniciar agente ────────────────────────────────────────────────
echo.
echo  Iniciando agente...
echo  (Deixe esta janela aberta enquanto estiver separando)
echo.

python\python.exe agent.py

:: Se o agente encerrar inesperadamente, mantém a janela aberta
echo.
echo  O agente foi encerrado.
pause
