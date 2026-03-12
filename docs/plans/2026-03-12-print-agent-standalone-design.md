# Design: print-agent-standalone

**Data:** 2026-03-12
**Status:** Aprovado
**Objetivo:** Pacote distribuível do agente de impressão Zebra que roda em máquinas sem Python ou ferramentas de desenvolvimento instaladas, sem alterar o `print-agent/` existente.

---

## Problema

O `iniciar_agente.bat` atual chama `python agent.py` — falha em máquinas sem Python.
O `ZebraAgent-WP.exe` (PyInstaller) pode ser bloqueado pelo Windows Defender em máquinas corporativas.
Não existe pacote pronto para distribuição via pen drive / pasta de rede.

## Solução

Nova pasta `print-agent-standalone/` com Python Embeddable + pywin32 pré-instalado + `agent.py` + launcher `.bat`. Zero instalação, zero risco de Defender, transparente para o operador.

---

## Estrutura de Arquivos

```
print-agent-standalone/
├── python/                          # Python 3.11 Embeddable (extraído)
│   ├── python.exe
│   ├── python311.dll
│   ├── python311._pth               # modificado: inclui Lib/site-packages
│   └── Lib/
│       └── site-packages/
│           └── win32/               # pywin32: win32print.pyd + DLLs
│               ├── win32print.pyd
│               ├── win32api.pyd
│               └── pywintypes311.dll
│
├── agent.py                         # cópia de print-agent/agent.py
├── iniciar.bat                      # launcher principal (duplo clique)
├── config.bat                       # PRINTER_NAME, BACKEND_URL (editável)
└── LEIA-ME.txt                      # instruções para o operador
```

---

## Componentes

### `iniciar.bat`
- Carrega `config.bat` (se existir) para variáveis de ambiente
- Chama `python\python.exe agent.py`
- Janela de console permanece aberta enquanto o agente roda
- Título da janela: "Agente de Impressão Zebra — Warehouse Picker"

### `config.bat`
```bat
:: Edite se necessário
set PRINTER_NAME=
set BACKEND_URL=https://seu-app.railway.app/api
```
- `PRINTER_NAME` vazio = autodetecção (comportamento padrão)
- Operador só edita se a impressora não for detectada automaticamente

### `python/` (Python Embeddable)
- Python 3.11.x embeddable package (Windows x86-64)
- Download oficial: python.org/downloads/windows
- `python311._pth` modificado para incluir `Lib\site-packages`
- pywin32 extraído da wheel (`pywin32-xxx-cp311-win_amd64.whl`) para `Lib\site-packages\win32\`

### `agent.py`
- Cópia direta de `print-agent/agent.py`
- Para atualizar: substituir apenas este arquivo na pasta distribuída

### `LEIA-ME.txt`
```
AGENTE DE IMPRESSÃO ZEBRA — WAREHOUSE PICKER
============================================

REQUISITOS:
  1. Driver Zebra ZD220 instalado no Windows
     Download: https://zebra.com → Support → ZD220 → Drivers → ZDesigner

COMO USAR:
  1. Conecte a impressora Zebra via USB e ligue
  2. Dê duplo clique em "iniciar.bat"
  3. Deixe a janela aberta enquanto estiver separando

CONFIGURAÇÃO (somente se necessário):
  - Edite "config.bat" para definir o nome da impressora ou URL do backend

SUPORTE:
  - Acesse http://localhost:9100/status para ver estado do agente
  - Acesse http://localhost:9100/test para imprimir etiqueta de teste
```

---

## Como Distribuir

| Situação | Ação |
|---|---|
| Nova máquina | Copiar a pasta `print-agent-standalone/` via pen drive |
| Atualizar agente | Substituir só `agent.py` na pasta |
| Mudar URL backend | Editar `config.bat` |
| Atalho na área de trabalho | Criar shortcut para `iniciar.bat` |

---

## O que NÃO muda

- `print-agent/agent.py` — não alterado
- `print-agent/ZebraAgent-WP.exe` — não alterado
- `print-agent/iniciar_agente.bat` — não alterado
- Frontend / backend — sem mudanças

---

## Script de Montagem (`print-agent-standalone/setup/montar_pacote.bat`)

Script auxiliar (roda na máquina do desenvolvedor) que automatiza a montagem do pacote:
1. Baixa Python Embeddable se não existir
2. Extrai pywin32 da wheel para `python/Lib/site-packages/win32/`
3. Copia `agent.py` de `../print-agent/agent.py`
4. Gera `iniciar.bat`, `config.bat`, `LEIA-ME.txt`

---

## Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| Máquinas 32-bit | Python Embeddable é 64-bit; praticamente todas as máquinas com Windows 10/11 são 64-bit |
| Driver não instalado | `agent.py` já exibe mensagem clara com link para download do driver |
| Porta 9100 ocupada | `agent.py` já mata processo antigo automaticamente |
| Operador fecha a janela | Necessário reabrir o `iniciar.bat`; pode criar atalho na barra de tarefas |
