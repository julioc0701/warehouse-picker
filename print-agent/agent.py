"""
Agente Local de Impressao Zebra — Warehouse Picker
====================================================
Execute este script no computador de cada operador.
Ele expoe http://localhost:6543 e envia ZPL para a Zebra ZD220 via USB.

Requisitos:
    pip install pywin32   (opcional — usado no Metodo A)
    Sem pywin32, usa o Metodo B (copy /B) automaticamente.

    O DRIVER ZEBRA ZD220 DEVE ESTAR INSTALADO NO WINDOWS.
    Baixe em: https://www.zebra.com/us/en/support-downloads/printers/desktop/zd220.html
              (secao "Drivers" > "ZDesigner Windows Driver")

Para empacotar como .exe (sem precisar de Python instalado):
    pip install pyinstaller
    pyinstaller --onefile --noconsole agent.py
    # O .exe estara em dist/agent.exe

Variaveis de ambiente (opcionais):
    PRINTER_NAME      — nome exato da impressora no Windows
                        Ex: "ZDesigner ZD220-203dpi ZPL"
                        Se omitido, o agente detecta a primeira Zebra automaticamente.
    PRINT_AGENT_PORT  — porta do agente (padrao: 6543)
"""

from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import json
import os
import subprocess
import platform
import sys
import tempfile
import threading
import time
import urllib.request

AGENT_PORT = int(os.getenv("PRINT_AGENT_PORT", "9100"))
PRINTER_NAME = os.getenv("PRINTER_NAME", "")   # deixe vazio para auto-deteccao
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8001/api")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "5"))   # segundos entre cada poll

# ---------------------------------------------------------------------------
# Cache de impressoras — detectado uma vez no startup, evita PowerShell lento
# ---------------------------------------------------------------------------
_cached_printer: str | None = None
_cached_all_printers: list[str] = []


def _run_powershell(cmd: str, timeout: int = 10) -> str:
    """Executa um comando PowerShell e retorna stdout."""
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", cmd],
            capture_output=True, text=True, timeout=timeout,
        )
        return result.stdout.strip()
    except Exception:
        return ""


def _detect_printers() -> tuple[str | None, list[str]]:
    """Detecta todas as impressoras e a Zebra. Retorna (zebra_name, all_names)."""
    if platform.system() != "Windows":
        return None, []

    all_raw = _run_powershell("Get-Printer | Select-Object -ExpandProperty Name")
    all_names = [line.strip() for line in all_raw.splitlines() if line.strip()]

    # Procura Zebra pelo nome configurado ou por regex
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

        # UNC local: \\localhost\Nome da Impressora
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
    Lanca excecao em caso de falha em ambos.
    """
    zpl_bytes = zpl.encode("utf-8")
    errors: list[str] = []

    # --- Metodo A: win32print ---
    try:
        _send_via_win32print(zpl_bytes, printer_name)
        return "win32print"
    except ImportError:
        errors.append("Metodo A ignorado: pywin32 nao instalado")
    except Exception as e:
        errors.append(f"Metodo A (win32print) falhou: {e}")

    # --- Metodo B: copy /B ---
    try:
        _send_via_copy(zpl_bytes, printer_name)
        return "copy/B"
    except Exception as e:
        errors.append(f"Metodo B (copy/B) falhou: {e}")

    # Ambos falharam
    raise RuntimeError(" | ".join(errors))


def do_print(zpl: str, printer_name: str | None = None) -> dict:
    name = printer_name or _cached_printer
    if not name:
        # Tenta detectar novamente antes de desistir
        refresh_printer_cache()
        name = _cached_printer

    if not name:
        msg = "Impressora Zebra nao encontrada."
        if _cached_all_printers:
            msg += f" Disponiveis: {', '.join(_cached_all_printers)}."
            msg += " Use PRINTER_NAME=<nome> para forcaro nome correto."
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

# ZPL minima para teste — imprime uma etiqueta 50x25mm em branco com texto
_TEST_ZPL = (
    "^XA"
    "^PW400"
    "^LL200"
    "^FO20,20^A0N,40,40^FDTeste Zebra ZD220^FS"
    "^FO20,80^A0N,28,28^FDWarehouse Picker OK^FS"
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
            pass  # cliente fechou a conexao antes da resposta

    def _cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self) -> None:          # preflight CORS
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/status":
            # Usa cache — resposta imediata sem chamar PowerShell
            self._send_json(200, {
                "status": "ok",
                "version": "1.2",
                "printer": _cached_printer or "nao detectada",
                "printer_found": _cached_printer is not None,
                "all_printers": _cached_all_printers,
            })

        elif self.path == "/refresh":
            # Forca nova deteccao de impressoras (chame apos instalar driver)
            refresh_printer_cache()
            self._send_json(200, {
                "status": "ok",
                "printer": _cached_printer or "nao detectada",
                "printer_found": _cached_printer is not None,
                "all_printers": _cached_all_printers,
            })

        elif self.path == "/test":
            # Imprime etiqueta de teste para verificar se comunicacao funciona
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

            # Aceita texto puro (ZPL direto) OU JSON {"zpl": "..."}
            if "application/json" in content_type:
                try:
                    body = json.loads(raw)
                except json.JSONDecodeError:
                    self._send_json(400, {"status": "error", "message": "JSON invalido"})
                    return
                zpl = body.get("zpl", "").strip()
                printer = body.get("printer") or None
            else:
                # text/plain ou qualquer outro: body inteiro é o ZPL
                zpl = raw.decode("utf-8", errors="replace").strip()
                printer = None

            if not zpl:
                self._send_json(400, {"status": "error", "message": "ZPL vazio"})
                return

            result = do_print(zpl, printer)
            code = 200 if result["status"] == "ok" else 500
            self._send_json(code, result)
        else:
            self._send_json(404, {"error": "not found"})

    def log_message(self, fmt, *args) -> None:
        status = args[1] if len(args) > 1 else "?"
        print(f"  [{status}] {args[0]}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Loop de polling — processa a fila de jobs do backend
# ---------------------------------------------------------------------------

def _backend_request(method: str, path: str, body: dict | None = None):
    """Faz uma requisição HTTP para o backend e retorna o JSON."""
    url = f"{BACKEND_URL}{path}"
    data = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        raise RuntimeError(f"Backend error ({method} {path}): {e}")


def _claim_job(job_id: int) -> bool:
    """Tenta mudar status para PRINTING. Retorna True se bem-sucedido."""
    try:
        _backend_request("PATCH", f"/print-jobs/{job_id}", {"status": "PRINTING"})
        return True
    except Exception as e:
        print(f"  [POLL] Erro ao reivindicar job {job_id}: {e}")
        return False


def _finish_job(job_id: int, result: dict) -> None:
    """Atualiza o job com o resultado da impressão."""
    if result["status"] == "ok":
        body = {
            "status": "PRINTED",
            "printer_name": result.get("printer", ""),
        }
    else:
        body = {
            "status": "ERROR",
            "error_msg": result.get("message", "Erro desconhecido"),
        }
    try:
        _backend_request("PATCH", f"/print-jobs/{job_id}", body)
    except Exception as e:
        print(f"  [POLL] Erro ao finalizar job {job_id}: {e}")


def _polling_loop() -> None:
    """
    Roda em thread separada.
    A cada POLL_INTERVAL segundos busca jobs PENDING e os imprime.
    """
    print(f"  [POLL] Loop iniciado — backend: {BACKEND_URL} / intervalo: {POLL_INTERVAL}s")
    while True:
        try:
            jobs = _backend_request("GET", "/print-jobs/pending")
            if jobs:
                print(f"  [POLL] {len(jobs)} job(s) pendente(s)")
            for job in jobs:
                job_id = job["id"]
                sku = job.get("sku", "?")
                zpl = job.get("zpl_content", "")

                if not zpl:
                    _finish_job(job_id, {"status": "error", "message": "ZPL vazio"})
                    continue

                if not _claim_job(job_id):
                    continue  # outro agente já pegou

                print(f"  [POLL] Imprimindo job {job_id} — SKU: {sku}")
                result = do_print(zpl)
                _finish_job(job_id, result)

                if result["status"] == "ok":
                    print(f"  [POLL] Job {job_id} impresso em '{result.get('printer')}'")
                else:
                    print(f"  [POLL] Job {job_id} ERRO: {result.get('message')}")

        except Exception as e:
            # Backend indisponivel ou erro de rede — tenta de novo no próximo ciclo
            print(f"  [POLL] Falha ao consultar backend: {e}")

        time.sleep(POLL_INTERVAL)


def _startup_detect() -> None:
    """Roda em thread separada — nao bloqueia o HTTP server."""
    print("  Detectando impressoras (background)...")
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
        print("  3. Chame: GET http://localhost:6543/refresh")
        if PRINTER_NAME == "":
            print("  4. Ou force o nome:")
            print("     set PRINTER_NAME=ZDesigner ZD220-203dpi ZPL && python agent.py")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    print("=" * 60)
    print("  [PRINT] Agente de Impressao Zebra - Warehouse Picker v1.2")
    print("=" * 60)

    # Verifica metodo de envio disponivel
    try:
        import win32print as _
        print("  Metodo       : A — win32print (pywin32 instalado)")
    except ImportError:
        print("  Metodo       : B — copy/B (pywin32 nao instalado, ok)")

    print(f"  URL          : http://localhost:{AGENT_PORT}")
    print()
    print("  GET  /status   → estado atual (instantaneo)")
    print("  GET  /refresh  → re-detecta impressoras sem reiniciar")
    print("  GET  /test     → imprime etiqueta de teste")
    print("  POST /print    → imprime ZPL  { zpl: '...' }")
    print("  Ctrl+C         → encerrar")
    print("=" * 60)

    # Detecta impressoras em background — servidor sobe imediatamente
    t = threading.Thread(target=_startup_detect, daemon=True)
    t.start()

    # Loop de polling — processa fila de jobs do backend
    p = threading.Thread(target=_polling_loop, daemon=True)
    p.start()

    server = ThreadingHTTPServer(("localhost", AGENT_PORT), PrintHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Agente encerrado.")
        sys.exit(0)
