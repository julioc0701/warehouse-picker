@echo off
%SystemRoot%\System32\chcp.com 65001 >nul 2>&1
setlocal EnableDelayedExpansion
title Montagem do print-agent-standalone

:: ── Caminhos completos (independente do PATH da maquina) ───────────
set PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe
set CURL=%SystemRoot%\System32\curl.exe

:: ── Configuracoes ──────────────────────────────────────────────────
set PYTHON_VER=3.11.9
set PYTHON_URL=https://www.python.org/ftp/python/%PYTHON_VER%/python-%PYTHON_VER%-embed-amd64.zip
set PYTHON_ZIP=python-%PYTHON_VER%-embed-amd64.zip

:: Paths relativos ao script (sempre roda da pasta setup/)
cd /d "%~dp0"
set ROOT=..
set PYTHON_DIR=%ROOT%\python

echo ============================================================
echo   Montagem do Pacote: print-agent-standalone
echo   Python: %PYTHON_VER% Embeddable (amd64)
echo ============================================================
echo.

:: ── [1/6] Baixar Python Embeddable ────────────────────────────────
if exist "%PYTHON_ZIP%" (
    echo [1/6] Python zip ja existe - pulando download.
) else (
    echo [1/6] Baixando Python %PYTHON_VER% Embeddable...
    "%PS%" -Command "Invoke-WebRequest -Uri '%PYTHON_URL%' -OutFile '%PYTHON_ZIP%' -UseBasicParsing"
    if errorlevel 1 (
        echo  ERRO: Falha no download. Verifique sua conexao com a internet.
        pause & exit /b 1
    )
    echo     Download concluido.
)

:: ── [2/6] Extrair Python Embeddable ───────────────────────────────
echo [2/6] Extraindo Python para python\...
if exist "%PYTHON_DIR%" %SystemRoot%\System32\cmd.exe /c rmdir /s /q "%PYTHON_DIR%"
"%PS%" -Command "Expand-Archive -Path '%PYTHON_ZIP%' -DestinationPath '%PYTHON_DIR%' -Force"
if errorlevel 1 (
    echo  ERRO: Falha ao extrair o zip.
    pause & exit /b 1
)
echo     Extracao concluida.

:: ── [3/6] Habilitar site-packages ─────────────────────────────────
echo [3/6] Habilitando site-packages no Python Embeddable...
"%PS%" -Command "(Get-Content '%PYTHON_DIR%\python311._pth') -replace '#import site', 'import site' | Set-Content '%PYTHON_DIR%\python311._pth'"
echo     site-packages habilitado.

:: ── [4/6] Instalar pip ────────────────────────────────────────────
echo [4/6] Instalando pip...
if not exist "get-pip.py" (
    "%PS%" -Command "Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile 'get-pip.py' -UseBasicParsing"
)
"%PYTHON_DIR%\python.exe" get-pip.py --no-warn-script-location -q
if errorlevel 1 (
    echo  ERRO: Falha ao instalar pip.
    pause & exit /b 1
)
echo     pip instalado.

:: ── [5/6] Instalar pywin32 ────────────────────────────────────────
echo [5/6] Instalando pywin32 (pode demorar ~1 min)...
"%PYTHON_DIR%\python.exe" -m pip install pywin32 --no-warn-script-location -q
if errorlevel 1 (
    echo  ERRO: Falha ao instalar pywin32.
    pause & exit /b 1
)

:: Rodar postinstall do pywin32 (registra DLLs no Windows)
echo       Executando pywin32 postinstall...
"%PYTHON_DIR%\python.exe" "%PYTHON_DIR%\Lib\site-packages\pywin32_system32\pywin32_postinstall.py" -install >nul 2>&1
echo     pywin32 instalado.

:: ── [6/6] Copiar agent.py ─────────────────────────────────────────
echo [6/6] Copiando agent.py de print-agent\...
%SystemRoot%\System32\cmd.exe /c copy /Y "..\..\print-agent\agent.py" "%ROOT%\agent.py" >nul
if errorlevel 1 (
    echo  ERRO: Nao foi possivel copiar agent.py.
    echo  Certifique-se que print-agent\agent.py existe.
    pause & exit /b 1
)
echo     agent.py copiado.

:: ── Limpeza ───────────────────────────────────────────────────────
if exist "get-pip.py" del get-pip.py >nul 2>&1

echo.
echo ============================================================
echo   PRONTO! Pacote montado com sucesso.
echo.
echo   Para distribuir: copie a pasta "print-agent-standalone\"
echo   completa via pen drive ou pasta compartilhada.
echo.
echo   Para testar agora: abra "..\iniciar.bat"
echo ============================================================
echo.
pause
