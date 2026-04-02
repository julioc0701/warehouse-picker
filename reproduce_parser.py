import io
import re
from io import BytesIO

# Mocking pdfplumber
class MockPage:
    def __init__(self, table=None, text=None):
        self._table = table
        self._text = text
    def extract_tables(self):
        return [self._table] if self._table else []
    def extract_text(self):
        return self._text

class MockPDF:
    def __init__(self, pages):
        self.pages = pages
    def __enter__(self): return self
    def __exit__(self, *args): pass

def _extract_sku(produto: str) -> str | None:
    # Pattern: 'SKU:\nSKU_VALUE' or 'SKU: SKU_VALUE'
    match = re.search(r"SKU:\s*\n?(\S+)", produto)
    return match.group(1) if match else None

def _extract_ml_code(produto: str) -> str | None:
    # Pattern: 'Código ML: CIGQ85538' (the 'C' and accent may be mangled by PDF)
    match = re.search(r"digo\s+ML:\s*([A-Z0-9]+)", produto, re.IGNORECASE)
    return match.group(1) if match else None

def _extract_ean(produto: str) -> str | None:
    # Pattern: 'Código universal:\n1234567890123' or inline
    match = re.search(r"niversal:\s*\n?(\d{8,14})", produto)
    return match.group(1) if match else None

def _extract_description(produto: str, sku: str) -> str:
    lines = produto.split("\n")
    # Find the line containing the SKU value, then take following lines as description
    for i, line in enumerate(lines):
        if sku in line:
            desc_parts = [l.strip() for l in lines[i + 1:] if l.strip()]
            return " ".join(desc_parts)[:200]
    return ""

def _parse_qty(value: str) -> int | None:
    try:
        return int(re.sub(r"[^\d]", "", value.strip()))
    except (ValueError, AttributeError):
        return None

def _extract_ml_table(pdf) -> list[dict]:
    items = []
    seen_skus = set()
    for page in pdf.pages:
        for table in page.extract_tables() or []:
            for row in table:
                if not row or not row[0]:
                    continue
                produto = str(row[0])
                unidades = str(row[1]) if len(row) > 1 and row[1] else ""
                if "digo ML:" not in produto:
                    continue
                sku = _extract_sku(produto)
                if not sku:
                    continue
                qty = _parse_qty(unidades)
                if not qty:
                    continue
                ean = _extract_ean(produto)
                ml_code = _extract_ml_code(produto)
                description = _extract_description(produto, sku)
                if sku in seen_skus:
                    for item in items:
                        if item["sku"] == sku:
                            item["qty_required"] += qty
                            break
                else:
                    seen_skus.add(sku)
                    items.append({
                        "sku": sku,
                        "ml_code": ml_code,
                        "description": description,
                        "qty_required": qty,
                        "ean": ean,
                    })
    return items

# Test cases
def test():
    # Case 1: valid SKU and qty
    p1 = "Código ML: CIGQ85538\nCódigo universal:\n7891234567890\nSKU:\nTEST-SKU\nProduct Description"
    row1 = [p1, "10"]
    pdf1 = MockPDF([MockPage(table=[row1])])
    print("Test 1 Result:", _extract_ml_table(pdf1))

    # Case 2: qty with dots/commas
    row2 = [p1, "1.000"]
    pdf2 = MockPDF([MockPage(table=[row2])])
    print("Test 2 Result:", _extract_ml_table(pdf2))

    # Case 3: row[0] is None
    row3 = [None, "5"]
    pdf3 = MockPDF([MockPage(table=[row3])])
    print("Test 3 Result:", _extract_ml_table(pdf3))

    # Case 4: Missing qty cell
    row4 = [p1]
    pdf4 = MockPDF([MockPage(table=[row4])])
    print("Test 4 Result:", _extract_ml_table(pdf4))

    # Case 5: Empty units cell
    row5 = [p1, ""]
    pdf5 = MockPDF([MockPage(table=[row5])])
    print("Test 5 Result (should be empty):", _extract_ml_table(pdf5))

test()
