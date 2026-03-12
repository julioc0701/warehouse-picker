@echo off
%SystemRoot%\System32\chcp.com 65001 >nul 2>&1
echo.
echo ========================================
echo   DEPLOY - warehouse-picker PRD
echo ========================================
echo.

cd /d "%~dp0"

echo [1/2] Enviando para GitHub (Railway auto-deploy)...
git push origin main
if %ERRORLEVEL% neq 0 (
    echo.
    echo ERRO: falha no git push. Verifique a conexao.
    pause
    exit /b 1
)

echo.
echo [2/2] Push concluido!
echo.
echo Railway iniciou o deploy automaticamente.
echo Acompanhe em: https://railway.app/dashboard
echo.
pause
