"""
Agente Local de Impressão Zebra — Warehouse Picker
====================================================
Execute este script no computador de cada operador.
Ele expõe http://localhost:6543 e envia ZPL para a Zebra ZD220 via USB.

Requisitos:
    pip install pywin32

Para empacotar como .exe (sem precisar de Python instalado):
    pip install pyinstaller
    pyinstaller --onefile --noconsole agent.py
    # O .exe estará em dist/agent.exe

Variáveis de ambiente (opcionais):
    PRINTER_NAME   — nome exato da impressora no Windows (ex: "ZDesigner ZD220-203dpi ZPL")
                     Se omitido, o agente detecta a primeira Zebra encontrada automaticamente.
    PRINT_AGENT_PORT — porta do agente (padrão: 6543)
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
import subprocess
import platform
import sys

AGENT_PORT = int(os.getenv("PRINT_AGENT_PORT", "6543"))
PRINTER_NAME = os.getenv("PRINTER_NAME", "")   # deixe vazio para auto-detecção


# ---------------------------------------------------------------------------
# Printer discovery & ZPL sending
# ---------------------------------------------------------------------------

def find_zebra_printer() -> str | None:
    """Retorna o nome da primeira Zebra encontrada no spooler do Windows."""
    if platform.system() != "Windows":
        return None
    try:
        cmd = (
            "Get-Printer | "
            "Where-Object { $_.Name -match 'Zebra|ZD|ZDesigner' } | "
            "Select-Object -First 1 -ExpandProperty Name"
        )
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", cmd],
            capture_output=True, text=True, timeout=5,
        )
        name = result.stdout.strip()
        return name if name else None
    except Exception:
        return None


def list_all_printers() -> list[str]:
    """Lista todas as impressoras instaladas no Windows."""
    if platform.system() != "Windows":
        return []
    try:
        cmd = "Get-Printer | Select-Object -ExpandProperty Name"
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", cmd],
            capture_output=True, text=True, timeout=5,
        )
        return [l.strip() for l in result.stdout.splitlines() if l.strip()]
    except Exception:
        return []


def send_zpl_to_printer(zpl: str, printer_name: str) -> None:
    """Envia ZPL bruto para o spooler do Windows via win32print (modo RAW)."""
    try:
        import win32print
    except ImportError:
        raise RuntimeError(
            "win32print não encontrado. Execute: pip install pywin32"
        )

    hp = win32print.OpenPrinter(printer_name)
    try:
        win32print.StartDocPrinter(hp, 1, ("Etiqueta ZPL", None, "RAW"))
        win32print.StartPagePrinter(hp)
        win32print.WritePrinter(hp, zpl.encode("utf-8"))
        win32print.EndPagePrinter(hp)
        win32print.EndDocPrinter(hp)
    finally:
        win32print.ClosePrinter(hp)


def do_print(zpl: str, printer_name: str | None = None) -> dict:
    name = printer_name or PRINTER_NAME or find_zebra_printer()
    if not name:
        return {
            "status": "error",
            "message": (
                "Nenhuma impressora Zebra encontrada. "
                "Verifique se o driver está instalado ou defina PRINTER_NAME."
            ),
        }
    try:
        send_zpl_to_printer(zpl, name)
        return {"status": "ok", "printer": name}
    except RuntimeError as e:
        return {"status": "error", "message": str(e)}
    except Exception as e:
        return {"status": "error", "message": f"Erro ao imprimir: {e}"}


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

class PrintHandler(BaseHTTPRequestHandler):
    """Minimal HTTP server — aceita GET /status e POST /print."""

    def _send_json(self, code: int, data: dict) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

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
            printer = PRINTER_NAME or find_zebra_printer()
            self._send_json(200, {
                "status": "ok",
                "version": "1.0",
                "printer": printer or "não detectada",
                "printer_found": printer is not None,
                "all_printers": list_all_printers(),
            })
        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path == "/print":
            length = int(self.headers.get("Content-Length", 0))
            try:
                body = json.loads(self.rfile.read(length))
            except json.JSONDecodeError:
                self._send_json(400, {"status": "error", "message": "JSON inválido"})
                return

            zpl = body.get("zpl", "").strip()
            printer = body.get("printer") or None

            if not zpl:
                self._send_json(400, {"status": "error", "message": "Campo 'zpl' vazio"})
                return

            result = do_print(zpl, printer)
            code = 200 if result["status"] == "ok" else 500
            self._send_json(code, result)
        else:
            self._send_json(404, {"error": "not found"})

    def log_message(self, fmt, *args) -> None:
        # Formato limpo no terminal
        status = args[1] if len(args) > 1 else "?"
        print(f"  [{status}] {args[0]}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    printer = PRINTER_NAME or find_zebra_printer()

    print("=" * 50)
    print("  🖨️  Agente de Impressão Zebra — Warehouse Picker")
    print("=" * 50)
    print(f"  URL    : http://localhost:{AGENT_PORT}")
    print(f"  Impressora detectada: {printer or '⚠ não encontrada'}")
    if not printer:
        print()
        print("  Para forçar uma impressora específica:")
        print("  set PRINTER_NAME=ZDesigner ZD220-203dpi ZPL")
        print("  python agent.py")
    print()
    print("  Pressione Ctrl+C para parar.")
    print("=" * 50)

    server = HTTPServer(("localhost", AGENT_PORT), PrintHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Agente encerrado.")
        sys.exit(0)
