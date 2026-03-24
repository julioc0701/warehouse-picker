"""
# Agente Local de Impressao Zebra — NVS
====================================================
Execute este script no computador de cada operador.
Ele expoe http://localhost:9100 e envia ZPL para a Zebra ZD220 via USB.

Requisitos:
    pip install pywin32   (opcional — usado no Metodo A)
    Sem pywin32, usa o Metodo B (copy /B) automaticamente.

    O DRIVER ZEBRA ZD220 DEVE ESTAR INSTALADO NO WINDOWS.
    Baixe em: https://www.zebra.com/us/en/support-downloads/printers/desktop/zd220.html
              (secao "Drivers" > "ZDesigner Windows Driver")

Para empacotar como .exe (com janela de console visivel):
    pip install pyinstaller
    pyinstaller --onefile agent.py
    # O .exe estara em dist/agent.exe

Variaveis de ambiente (opcionais):
    PRINTER_NAME      — nome exato da impressora no Windows
                        Ex: "ZDesigner ZD220-203dpi ZPL"
                        Se omitido, o agente detecta a primeira Zebra automaticamente.
    PRINT_AGENT_PORT  — porta do agente (padrao: 9100)
    ENABLE_POLLING    — "1" para ativar polling de jobs no backend (padrao: desativado)
    BACKEND_URL       — URL do backend, necessario apenas se ENABLE_POLLING=1
    POLL_INTERVAL     — intervalo em segundos entre cada poll (padrao: 5)
"""

from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import json
import os
import platform
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request

AGENT_VERSION   = "1.4" # Atualizado para 1.4 por segurança CORS
AGENT_PORT      = int(os.getenv("PRINT_AGENT_PORT", "9100"))
PRINTER_NAME    = os.getenv("PRINTER_NAME", "")   # vazio = auto-deteccao
ENABLE_POLLING  = os.getenv("ENABLE_POLLING", "0").strip() == "1"
BACKEND_URL     = os.getenv("BACKEND_URL", "http://localhost:8001/api").strip()
POLL_INTERVAL   = int(os.getenv("POLL_INTERVAL", "5"))

# Allowed Origins para o FrontEnd Web — Proteção contra comandos indesejados no navegador
ALLOWED_ORIGINS = [
    "http://localhost:5173", 
    "http://localhost:5174", 
    "http://localhost:5175",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175"
]

# ---------------------------------------------------------------------------
# Cache de impressoras — detectado uma vez no startup, evita PowerShell lento
# ---------------------------------------------------------------------------
_cached_printer: str | None = None
_cached_all_printers: list[str] = []


def _detect_printers() -> tuple[str | None, list[str]]:
    """
    Detecta todas as impressoras via win32print.EnumPrinters (sem PowerShell).
    Retorna (zebra_name, all_names).
    """
    if platform.system() != "Windows":
        return None, []

    try:
        import win32print
        import re
        raw = win32print.EnumPrinters(
            win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
        )
        # raw = list of (flags, description, name, comment)
        all_names = [entry[2] for entry in raw if entry[2]]
    except Exception:
        all_names = []

    zebra = PRINTER_NAME or None
    if not zebra:
        import re
        for name in all_names:
            if re.search(r"Zebra|ZD|ZDesigner", name, re.IGNORECASE):
                zebra = name
                break

    return zebra, all_names


def refresh_printer_cache() -> None:
    """Atualiza o cache de impressoras (chamado no startup e em /refresh)."""
    global _cached_printer, _cached_all_printers
    _cached_printer, _cached_all_printers = _detect_printers()


# ---------------------------------------------------------------------------
# Verificacao de porta — garante que apenas uma instancia rode
# ---------------------------------------------------------------------------

def _port_in_use(port: int) -> bool:
    """Retorna True se algo ja esta escutando na porta (IPv4 explícito)."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _is_our_agent(port: int) -> bool:
    """Retorna True se o processo na porta ja e nosso agente (mesma versao)."""
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/status")
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read())
            return data.get("agent") == "warehouse-picker-zebra"
    except Exception:
        return False


def _kill_process_on_port(port: int) -> bool:
    """
    Tenta encerrar o processo que esta ocupando a porta no Windows.
    Usa netstat + taskkill. Retorna True se conseguiu matar.
    """
    try:
        result = subprocess.run(
            ["netstat", "-ano", "-p", "TCP"],
            capture_output=True, text=True, timeout=8,
        )
        for line in result.stdout.splitlines():
            if f":{port}" in line and "LISTENING" in line:
                parts = line.strip().split()
                pid = parts[-1]
                if pid.isdigit() and pid != "0":
                    subprocess.run(
                        ["taskkill", "/PID", pid, "/F"],
                        capture_output=True, timeout=5,
                    )
                    time.sleep(1)
                    return not _port_in_use(port)
    except Exception:
        pass
    return False


def _check_startup_port() -> None:
    """
    Verifica se a porta esta disponivel antes de subir o servidor.
    - Se for nosso agente: exibe status e sai sem erro.
    - Se for outro processo: tenta matar e continua; se falhar, exibe erro e sai.
    """
    if not _port_in_use(AGENT_PORT):
        return  # porta livre, tudo ok

    # Porta ocupada — verifica se e nosso agente
    if _is_our_agent(AGENT_PORT):
        print()
        print(f"  [INFO] O agente ja esta rodando na porta {AGENT_PORT}.")
        print(f"         Nao e necessario abrir uma segunda instancia.")
        print(f"         Feche esta janela ou encerre o processo existente para reiniciar.")
        print()
        input("  Pressione ENTER para sair...")
        sys.exit(0)

    # E outro processo (agente antigo, ZebraPrintAgent.exe, etc.)
    print()
    print(f"  [!] PORTA {AGENT_PORT} ESTA OCUPADA por outro processo.")
    print(f"      Tentando encerrar automaticamente...")

    if _kill_process_on_port(AGENT_PORT):
        print(f"      Processo antigo encerrado com sucesso. Continuando...")
        print()
        return

    # Nao conseguiu matar — exibe erro claro e sai
    print()
    print("  " + "=" * 56)
    print(f"  ERRO: Porta {AGENT_PORT} ocupada e nao foi possivel libera-la.")
    print()
    print("  O que fazer:")
    print("  1. Abra o Gerenciador de Tarefas (Ctrl+Shift+Esc)")
    print("  2. Procure por: ZebraPrintAgent.exe, agent.exe ou python.exe")
    print("  3. Encerre o processo encontrado")
    print("  4. Abra o agente novamente")
    print("  " + "=" * 56)
    print()
    input("  Pressione ENTER para sair...")
    sys.exit(1)


# ---------------------------------------------------------------------------
# ZPL sending — dois metodos em cascata
# ---------------------------------------------------------------------------

def _send_via_win32print(zpl_bytes: bytes, printer_name: str) -> None:
    """
    Metodo A: win32print em modo RAW.
    Mais direto, melhor para producao. Requer: pip install pywin32
    """
    import win32print
    hp = win32print.OpenPrinter(printer_name)
    try:
        win32print.StartDocPrinter(hp, 1, ("Etiqueta ZPL", None, "RAW"))
        win32print.StartPagePrinter(hp)
        win32print.WritePrinter(hp, zpl_bytes)
        win32print.EndPagePrinter(hp)
        win32print.EndDocPrinter(hp)
    finally:
        win32print.ClosePrinter(hp)


def _send_via_copy(zpl_bytes: bytes, printer_name: str) -> None:
    """
    Metodo B: grava ZPL em arquivo temp e envia com 'copy /B' ao caminho UNC.
    Nao precisa de pywin32. Requer driver ZDesigner instalado.
    """
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", suffix=".zpl", delete=False
        ) as tmp:
            tmp.write(zpl_bytes)
            tmp_path = tmp.name

        unc = f"\\\\localhost\\{printer_name}"
        result = subprocess.run(
            ["cmd", "/c", "copy", "/B", tmp_path, unc],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"copy /B falhou (code {result.returncode}): "
                f"{(result.stderr or result.stdout).strip()}"
            )
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def send_zpl_to_printer(zpl: str, printer_name: str) -> str:
    """
    Envia ZPL para a Zebra. Tenta Metodo A (win32print) e faz fallback
    para Metodo B (copy /B). Retorna o nome do metodo usado.
    Lanca RuntimeError se ambos falharem.
    """
    zpl_bytes = zpl.encode("utf-8")
    errors: list[str] = []

    try:
        _send_via_win32print(zpl_bytes, printer_name)
        return "win32print"
    except ImportError:
        errors.append("Metodo A ignorado: pywin32 nao instalado")
    except Exception as e:
        errors.append(f"Metodo A (win32print) falhou: {e}")

    try:
        _send_via_copy(zpl_bytes, printer_name)
        return "copy/B"
    except Exception as e:
        errors.append(f"Metodo B (copy/B) falhou: {e}")

    raise RuntimeError(" | ".join(errors))


def do_print(zpl: str, printer_name: str | None = None) -> dict:
    name = printer_name or _cached_printer
    if not name:
        refresh_printer_cache()
        name = _cached_printer

    if not name:
        msg = "Impressora Zebra nao encontrada."
        if _cached_all_printers:
            msg += f" Disponiveis: {', '.join(_cached_all_printers)}."
            msg += " Use PRINTER_NAME=<nome> para forcar o nome correto."
        else:
            msg += (
                " Nenhuma impressora instalada no Windows."
                " Instale o driver ZD220 em zebra.com e clique Atualizar."
            )
        return {"status": "error", "message": msg}

    try:
        method = send_zpl_to_printer(zpl, name)
        return {"status": "ok", "printer": name, "method": method}
    except RuntimeError as e:
        return {"status": "error", "message": str(e)}
    except Exception as e:
        return {"status": "error", "message": f"Erro inesperado em '{name}': {e}"}


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

_TEST_ZPL = (
    "^XA"
    "^PW400"
    "^LL200"
    "^FO20,20^A0N,40,40^FDTeste Zebra ZD220^FS"
    "^FO20,80^A0N,28,28^FDNVS OK^FS"
    "^XZ"
)


class PrintHandler(BaseHTTPRequestHandler):
    """HTTP server — aceita GET /status, GET /refresh, GET /test e POST /print."""

    def _send_json(self, code: int, data: dict) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        try:
            self.wfile.write(body)
        except (ConnectionAbortedError, BrokenPipeError):
            pass

    def _cors_headers(self) -> None:
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
        else:
            # Se não for uma requisição de navegador direto com Origin amigável, não abrimos CORS.
            # Postman ou scripts backend sem bloqueio CORS ainda funcionarão localmente.
            # O frontend web não enviará ZPL via XHR se não confirmarmos o Origin original.
            self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGINS[0])
            
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/status":
            self._send_json(200, {
                "status": "ok",
                "agent": "warehouse-picker-zebra",   # identidade unica
                "version": AGENT_VERSION,
                "printer": _cached_printer or "nao detectada",
                "printer_found": _cached_printer is not None,
                "all_printers": _cached_all_printers,
            })

        elif self.path == "/refresh":
            refresh_printer_cache()
            self._send_json(200, {
                "status": "ok",
                "agent": "warehouse-picker-zebra",
                "version": AGENT_VERSION,
                "printer": _cached_printer or "nao detectada",
                "printer_found": _cached_printer is not None,
                "all_printers": _cached_all_printers,
            })

        elif self.path == "/health":
            self._send_json(200, {
                "service": "zebra-print-agent",
                "status": "ok",
                "version": AGENT_VERSION,
                "printer_found": _cached_printer is not None,
            })

        elif self.path == "/test":
            result = do_print(_TEST_ZPL)
            code = 200 if result["status"] == "ok" else 500
            self._send_json(code, result)

        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path == "/print":
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            content_type = self.headers.get("Content-Type", "")

            if "application/json" in content_type:
                try:
                    body = json.loads(raw)
                except json.JSONDecodeError:
                    self._send_json(400, {"status": "error", "message": "JSON invalido"})
                    return
                zpl = body.get("zpl", "").strip()
                printer = body.get("printer") or None
            else:
                zpl = raw.decode("utf-8", errors="replace").strip()
                printer = None

            if not zpl:
                self._send_json(400, {"status": "error", "message": "ZPL vazio"})
                return

            result = do_print(zpl, printer)
            code = 200 if result["status"] == "ok" else 500

            # Log de erro no console para facilitar diagnostico
            if result["status"] != "ok":
                print(f"  [ERRO] Impressao falhou: {result.get('message', '?')}")
            else:
                print(f"  [OK]   Impresso em '{result.get('printer')}' via {result.get('method')}")

            self._send_json(code, result)
        else:
            self._send_json(404, {"error": "not found"})

    def log_message(self, fmt, *args) -> None:
        # Suprime o log padrao do BaseHTTPRequestHandler (ja logamos acima)
        pass


# ---------------------------------------------------------------------------
# Loop de polling (somente se ENABLE_POLLING=1)
# ---------------------------------------------------------------------------

def _backend_request(method: str, path: str, body: dict | None = None):
    url = f"{BACKEND_URL}{path}"
    data = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", f"NVS-Print-Agent/{AGENT_VERSION}")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _polling_loop() -> None:
    """
    Roda em thread separada (somente se ENABLE_POLLING=1).
    A cada POLL_INTERVAL segundos busca jobs PENDING e os imprime.
    Recua para 60s apos 5 falhas consecutivas.
    """
    print(f"  [POLL] Loop ativo — backend: {BACKEND_URL} / intervalo: {POLL_INTERVAL}s")
    failures = 0
    MAX_FAILURES = 5
    idle_count = 0

    while True:
        try:
            # Step 1: Get list of pending jobs (metadata only, no ZPL)
            jobs = _backend_request("GET", "/print-jobs/pending")
            failures = 0  # reset ao conseguir comunicar

            if jobs:
                print(f"  [POLL] {len(jobs)} job(s) pendente(s) encontrado(s)!")
                idle_count = 0
            else:
                idle_count += 1
                if idle_count >= (60 // POLL_INTERVAL):
                    print(f"  [POLL] Verificando... (sem novos jobs na fila)")
                    idle_count = 0

            for job in jobs:
                job_id = job["id"]
                sku    = job.get("sku", "?")

                # Step 2: Try to RESERVE the job (PATCH status to PRINTING)
                # This ensures only one agent handles this job.
                try:
                    _backend_request("PATCH", f"/print-jobs/{job_id}", {"status": "PRINTING"})
                except urllib.error.HTTPError as e:
                    if e.code == 400:
                        # Job já foi pego por outro operador entre o GET e o PATCH
                        continue
                    raise e
                except Exception as e:
                    print(f"  [POLL] Erro ao reservar job {job_id}: {e}")
                    continue

                # Step 3: Fetch the full job details (including ZPL) now that we own it
                try:
                    full_job = _backend_request("GET", f"/print-jobs/{job_id}")
                    zpl = full_job.get("zpl_content", "")
                except Exception as e:
                    print(f"  [POLL] Erro ao baixar ZPL do job {job_id}: {e}")
                    _backend_request("PATCH", f"/print-jobs/{job_id}", {"status": "PENDING", "error_msg": "Falha no download"})
                    continue

                if not zpl:
                    _backend_request("PATCH", f"/print-jobs/{job_id}", {"status": "ERROR", "error_msg": "ZPL vazio"})
                    continue

                print(f"  [POLL] Imprimindo job {job_id} — SKU: {sku}")
                result = do_print(zpl)

                fin_body = (
                    {"status": "PRINTED", "printer_name": result.get("printer", "")}
                    if result["status"] == "ok"
                    else {"status": "ERROR", "error_msg": result.get("message", "Erro desconhecido")}
                )
                try:
                    _backend_request("PATCH", f"/print-jobs/{job_id}", fin_body)
                except Exception as e:
                    print(f"  [POLL] Nao foi possivel atualizar status do job {job_id}: {e}")

                if result["status"] == "ok":
                    print(f"  [POLL] Job {job_id} impresso com sucesso!")
                else:
                    print(f"  [POLL] Job {job_id} FALHOU: {result.get('message')}")

        except Exception as e:
            failures += 1
            print(f"  [POLL] Falha na comunicacao ({failures}/{MAX_FAILURES}): {e}")
            if failures >= MAX_FAILURES:
                print(f"  [POLL] Backend nao acessivel. Tentando novamente em 60s...")

        interval = 60 if failures >= MAX_FAILURES else POLL_INTERVAL
        time.sleep(interval)


# ---------------------------------------------------------------------------
# Deteccao de impressoras em background
# ---------------------------------------------------------------------------

def _startup_detect() -> None:
    print("  Detectando impressoras...")
    refresh_printer_cache()
    print(f"  Zebra        : {_cached_printer or '[!] NAO ENCONTRADA'}")
    if _cached_all_printers:
        for p in _cached_all_printers:
            print(f"  Disponivel   : {p}")
    else:
        print("  Disponiveis  : (nenhuma impressora instalada)")

    if not _cached_printer:
        print()
        print("  *** IMPRESSORA NAO DETECTADA ***")
        print("  1. Instale o driver: https://zebra.com (ZDesigner Windows Driver)")
        print("  2. Conecte a ZD220 via USB e ligue a impressora")
        print(f"  3. Acesse: http://localhost:{AGENT_PORT}/refresh")
        if PRINTER_NAME == "":
            print("  4. Ou force o nome:")
            print("     set PRINTER_NAME=ZDesigner ZD220-203dpi ZPL && python agent.py")
    print()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    print("=" * 60)
    print(f"  Agente de Impressao Zebra — NVS v{AGENT_VERSION}")
    print("=" * 60)

    # Verifica metodo de impressao disponivel
    try:
        import win32print as _
        print("  Metodo       : A — win32print (pywin32 instalado)")
    except ImportError:
        print("  Metodo       : B — copy/B (pywin32 nao instalado, ok)")

    print(f"  Porta        : {AGENT_PORT}")
    print(f"  Polling      : {'ATIVO — ' + BACKEND_URL if ENABLE_POLLING else 'desativado (padrao)'}")
    print()
    print(f"  GET  /health   → health check (service + status)")
    print(f"  GET  /status   → estado atual")
    print(f"  GET  /refresh  → re-detecta impressoras sem reiniciar")
    print(f"  GET  /test     → imprime etiqueta de teste")
    print(f"  POST /print    → imprime ZPL em modo RAW (text/plain)")
    print(f"  Ctrl+C         → encerrar")
    print("=" * 60)
    print()

    # Garante que a porta esta livre (mata processo antigo se necessario)
    _check_startup_port()

    # Detecta impressoras ANTES de subir o servidor — garante _cached_printer pronto
    _startup_detect()

    # Polling (somente se habilitado explicitamente)
    if ENABLE_POLLING:
        threading.Thread(target=_polling_loop, daemon=True).start()

    server = ThreadingHTTPServer(("127.0.0.1", AGENT_PORT), PrintHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Agente encerrado.")
        sys.exit(0)
