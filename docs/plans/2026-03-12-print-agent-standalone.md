# print-agent-standalone Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Criar o pacote `print-agent-standalone/` — distribuível via pen drive, roda em máquinas sem Python instalado, sem alterar nada do `print-agent/` existente.

**Architecture:** Python 3.11 Embeddable (oficial python.org, ~25MB) + pywin32 instalado dentro da pasta + `agent.py` copiado do `print-agent/`. Um `iniciar.bat` chama `python\python.exe agent.py` usando o Python embutido na própria pasta. Um script `setup/montar_pacote.bat` automatiza a montagem na máquina do desenvolvedor.

**Tech Stack:** Windows Batch Script, Python 3.11 Embeddable, pywin32, PowerShell (apenas para download/extração na montagem)

---

## Visão Geral dos Arquivos

```
warehouse-picker/
└── print-agent-standalone/
    ├── .gitignore              ← ignora python/ e agent.py (binários/cópia)
    ├── iniciar.bat             ← launcher para o operador (duplo clique)
    ├── config.bat              ← configurações editáveis (PRINTER_NAME, BACKEND_URL)
    ├── LEIA-ME.txt             ← instruções simples para o operador
    ├── setup/
    │   └── montar_pacote.bat   ← script do desenvolvedor para montar o pacote
    │
    │   [gerados pelo montar_pacote.bat — não versionados]
    ├── agent.py                ← cópia de print-agent/agent.py
    └── python/                 ← Python 3.11 Embeddable + pywin32
        ├── python.exe
        ├── python311.dll
        ├── python311._pth      ← modificado para habilitar site-packages
        └── Lib/site-packages/  ← pywin32 instalado aqui
```

---

## Task 1: Criar estrutura de pastas e `.gitignore`

**Files:**
- Create: `print-agent-standalone/.gitignore`
- Create: `print-agent-standalone/setup/` (pasta)

**Step 1: Criar pasta `print-agent-standalone/`**

```
mkdir print-agent-standalone
mkdir print-agent-standalone\setup
```

**Step 2: Criar `.gitignore`**

Conteúdo de `print-agent-standalone/.gitignore`:
```
# Python Embeddable — grande demais para versionar (~25MB)
python/

# agent.py é cópia de print-agent/agent.py — gerado pelo montar_pacote.bat
agent.py

# Temporários de build
*.zip
get-pip.py
```

**Step 3: Verificar**

```
ls print-agent-standalone/
```
Esperado: `.gitignore` e pasta `setup/` visíveis.

**Step 4: Commit**

```bash
git add print-agent-standalone/.gitignore
git commit -m "feat: print-agent-standalone — estrutura inicial e gitignore"
```

---

## Task 2: Criar `config.bat`

**Files:**
- Create: `print-agent-standalone/config.bat`

**Step 1: Criar o arquivo**

Conteúdo de `print-agent-standalone/config.bat`:
```bat
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
```

**Step 2: Commit**

```bash
git add print-agent-standalone/config.bat
git commit -m "feat: print-agent-standalone — config.bat com PRINTER_NAME e BACKEND_URL"
```

---

## Task 3: Criar `iniciar.bat`

**Files:**
- Create: `print-agent-standalone/iniciar.bat`

**Step 1: Criar o arquivo**

Conteúdo de `print-agent-standalone/iniciar.bat`:
```bat
@echo off
chcp 65001 >nul
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
```

**Step 2: Verificar a lógica**

O `.bat`:
- Verifica se `python\python.exe` existe → erro claro se não
- Verifica se `agent.py` existe → erro claro se não
- Carrega `config.bat` para variáveis de ambiente
- Executa `python\python.exe agent.py`
- Mantém janela aberta se o agente encerrar

**Step 3: Commit**

```bash
git add print-agent-standalone/iniciar.bat
git commit -m "feat: print-agent-standalone — iniciar.bat com validações"
```

---

## Task 4: Criar `LEIA-ME.txt`

**Files:**
- Create: `print-agent-standalone/LEIA-ME.txt`

**Step 1: Criar o arquivo**

Conteúdo de `print-agent-standalone/LEIA-ME.txt`:
```
============================================================
  AGENTE DE IMPRESSÃO ZEBRA — WAREHOUSE PICKER
============================================================

PRÉ-REQUISITO (uma vez por máquina):
  Instale o driver Zebra ZD220:
  https://www.zebra.com → Support → ZD220 → Drivers → ZDesigner

COMO USAR:
  1. Conecte a impressora Zebra via USB e ligue-a
  2. Dê duplo clique em "iniciar.bat"
  3. Deixe a janela aberta enquanto estiver fazendo separação

CONFIGURAÇÃO (somente se necessário):
  - Edite "config.bat" para definir o nome da impressora
    ou a URL do sistema (backend)

DIAGNÓSTICO:
  Com o agente aberto, acesse no navegador:
  http://localhost:9100/status   → mostra estado e impressora detectada
  http://localhost:9100/test     → imprime etiqueta de teste
  http://localhost:9100/refresh  → re-detecta impressoras sem reiniciar

SUPORTE:
  Se a impressora não for detectada automaticamente:
  1. Abra "config.bat"
  2. Defina PRINTER_NAME com o nome exato da impressora
     (visível em Windows → Impressoras e Scanners)
  3. Salve e reabra "iniciar.bat"
============================================================
```

**Step 2: Commit**

```bash
git add print-agent-standalone/LEIA-ME.txt
git commit -m "feat: print-agent-standalone — LEIA-ME.txt para o operador"
```

---

## Task 5: Criar `setup/montar_pacote.bat`

Este é o script que o **desenvolvedor** roda uma vez para montar o pacote distribuível. Baixa Python Embeddable, instala pywin32, copia `agent.py`.

**Files:**
- Create: `print-agent-standalone/setup/montar_pacote.bat`

**Step 1: Criar o arquivo**

Conteúdo de `print-agent-standalone/setup/montar_pacote.bat`:
```bat
@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Montagem do print-agent-standalone

:: ── Configurações ──────────────────────────────────────────────────
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
    echo [1/6] Python zip ja existe — pulando download.
) else (
    echo [1/6] Baixando Python %PYTHON_VER% Embeddable...
    powershell -Command "Invoke-WebRequest -Uri '%PYTHON_URL%' -OutFile '%PYTHON_ZIP%'"
    if errorlevel 1 (
        echo  ERRO: Falha no download. Verifique sua conexao com a internet.
        pause & exit /b 1
    )
)

:: ── [2/6] Extrair Python Embeddable ───────────────────────────────
echo [2/6] Extraindo Python para python\...
if exist "%PYTHON_DIR%" rmdir /s /q "%PYTHON_DIR%"
powershell -Command "Expand-Archive -Path '%PYTHON_ZIP%' -DestinationPath '%PYTHON_DIR%' -Force"
if errorlevel 1 (
    echo  ERRO: Falha ao extrair o zip.
    pause & exit /b 1
)

:: ── [3/6] Habilitar site-packages ─────────────────────────────────
echo [3/6] Habilitando site-packages no Python Embeddable...
powershell -Command ^
    "(Get-Content '%PYTHON_DIR%\python311._pth') ^
     -replace '#import site', 'import site' ^
     | Set-Content '%PYTHON_DIR%\python311._pth'"

:: ── [4/6] Instalar pip ────────────────────────────────────────────
echo [4/6] Instalando pip...
if not exist "get-pip.py" (
    powershell -Command "Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile 'get-pip.py'"
)
"%PYTHON_DIR%\python.exe" get-pip.py --no-warn-script-location -q
if errorlevel 1 (
    echo  ERRO: Falha ao instalar pip.
    pause & exit /b 1
)

:: ── [5/6] Instalar pywin32 ────────────────────────────────────────
echo [5/6] Instalando pywin32...
"%PYTHON_DIR%\python.exe" -m pip install pywin32 --no-warn-script-location -q
if errorlevel 1 (
    echo  ERRO: Falha ao instalar pywin32.
    pause & exit /b 1
)

:: Rodar postinstall do pywin32 (registra DLLs no Windows)
echo       Executando pywin32 postinstall...
"%PYTHON_DIR%\python.exe" "%PYTHON_DIR%\Lib\site-packages\pywin32_system32\pywin32_postinstall.py" -install >nul 2>&1
:: Ignora erro do postinstall (nem sempre necessário)

:: ── [6/6] Copiar agent.py ─────────────────────────────────────────
echo [6/6] Copiando agent.py de print-agent\...
copy /Y "..\..\print-agent\agent.py" "%ROOT%\agent.py" >nul
if errorlevel 1 (
    echo  ERRO: Nao foi possivel copiar agent.py.
    echo  Certifique-se que print-agent\agent.py existe.
    pause & exit /b 1
)

:: ── Limpeza ───────────────────────────────────────────────────────
del get-pip.py >nul 2>&1

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
```

**Step 2: Verificar a lógica do script**

O script:
1. Baixa `python-3.11.9-embed-amd64.zip` (~27MB) se não existir
2. Extrai para `python/`
3. Descomenta `import site` no `python311._pth` → habilita site-packages
4. Instala `pip` via `get-pip.py`
5. Instala `pywin32` via pip na pasta embeddable
6. Roda `pywin32_postinstall.py` para registrar DLLs
7. Copia `agent.py` de `../print-agent/agent.py`
8. Remove temporários

**Step 3: Commit**

```bash
git add print-agent-standalone/setup/montar_pacote.bat
git commit -m "feat: print-agent-standalone — setup/montar_pacote.bat (montagem automática)"
```

---

## Task 6: Executar `montar_pacote.bat` e validar

**Step 1: Rodar o script de montagem**

Na máquina de desenvolvimento, navegar até:
```
C:\Users\julio\Downloads\warehouse-picker\print-agent-standalone\setup\
```
Dar duplo clique em `montar_pacote.bat` (ou rodar no terminal).

**Step 2: Verificar estrutura resultante**

```
dir print-agent-standalone\python\
```
Esperado: `python.exe`, `python311.dll`, `python311._pth`, pasta `Lib\`

```
dir print-agent-standalone\python\Lib\site-packages\win32\
```
Esperado: `win32print.pyd`, `win32api.pyd`, `pywintypes311.dll`

```
dir print-agent-standalone\
```
Esperado: `agent.py` presente (copiado pelo script)

**Step 3: Testar que o Python Embeddable funciona**

```bat
print-agent-standalone\python\python.exe -c "import win32print; print('win32print OK')"
```
Esperado: `win32print OK`

Se falhar com ImportError → pywin32 não foi instalado corretamente. Re-rodar `montar_pacote.bat`.

---

## Task 7: Testar o agente completo

**Step 1: Abrir o agente**

Duplo clique em `print-agent-standalone\iniciar.bat`

**Step 2: Verificar saída no console**

Esperado na janela:
```
============================================================
  Agente de Impressao Zebra — Warehouse Picker v1.3
============================================================
  Método       : A — win32print (pywin32 instalado)
  Porta        : 9100
  Detectando impressoras...
  Zebra        : ZDesigner ZD220-203dpi ZPL   (ou [!] NAO ENCONTRADA)
```

**Step 3: Testar endpoint `/health`**

Abrir navegador ou PowerShell:
```powershell
Invoke-RestMethod http://localhost:9100/health
```
Esperado:
```json
{ "service": "zebra-print-agent", "status": "ok", "version": "1.3" }
```

**Step 4: Testar endpoint `/status`**

```powershell
Invoke-RestMethod http://localhost:9100/status
```
Esperado: JSON com `agent`, `version`, `printer`, `all_printers`

**Step 5: Testar impressão (se impressora disponível)**

```powershell
Invoke-RestMethod http://localhost:9100/test
```
Esperado: `{ "status": "ok", "printer": "...", "method": "win32print" }`

---

## Task 8: Commit final e push

**Step 1: Verificar o que será commitado**

```bash
git status
```
Esperado: apenas os 4 arquivos versionados (`.gitignore`, `config.bat`, `iniciar.bat`, `LEIA-ME.txt`, `setup/montar_pacote.bat`). A pasta `python/` e `agent.py` devem estar ignorados pelo `.gitignore`.

**Step 2: Commit e push**

```bash
git add print-agent-standalone/
git commit -m "feat: print-agent-standalone — pacote distribuível sem Python instalado"
git push
```

---

## Checklist de Distribuição

Antes de entregar o pen drive ao operador, confirmar:

- [ ] `montar_pacote.bat` foi executado com sucesso
- [ ] `python\python.exe` existe na pasta
- [ ] `agent.py` existe na pasta
- [ ] `python\python.exe -c "import win32print; print('OK')"` retorna `OK`
- [ ] `iniciar.bat` abre e mostra o agente rodando
- [ ] `http://localhost:9100/health` retorna `{"status": "ok"}`
- [ ] Driver Zebra ZD220 está instalado na máquina destino

---

## Atualização Futura do Agente

Quando `print-agent/agent.py` for atualizado:
1. Na máquina com o pacote montado: `copy /Y print-agent\agent.py print-agent-standalone\agent.py`
2. Copiar apenas o `agent.py` atualizado para os pen drives/máquinas dos operadores
3. **Não** é necessário re-montar o Python Embeddable
