import textwrap

def generate_shopee_paired_zpl(item: dict, is_single: bool = False) -> str:
    """
    Gera blocos ZPL para Shopee em colunas duplas (2-up) otimizadas para 100x30mm 
    ou 100x40mm, resetando o estado de impressão para evitar deslocamentos do hardware.
    """
    product_name = item.get("product_name", "").replace('^', '')
    seller_sku = item.get("seller_sku", "")
    barcode = item.get("barcode", "")
    whs_skuid = item.get("whs_skuid", "")
    
    # Wrap name to fit in half-label
    name_line = textwrap.wrap(product_name, width=28)[0] if product_name else ""
    
    # Adicionamos comandos de reset de estado (PW, LL, LH, LS) para garantir o alinhamento
    zpl = "^XA\n^PW640\n^LL200\n^LH0,0\n^LS0\n^CI28\n"
    
    # ── COLUNA 1 (Esquerda) ──
    # Nome no topo
    zpl += f"^FO10,5^A0N,18,18^FD{name_line}^FS\n"
    # QR Code na esquerda (com nível de correção M para ficar fisicamente menor)
    zpl += f"^FO10,32^BQN,2,2^FDMA,{barcode}^FS\n"
    # Textos na direita do QR Code (X=90)
    zpl += f"^FO90,35^A0N,12,10^FDSKU: {seller_sku}^FS\n"
    zpl += f"^FO90,53^A0N,12,10^FDEAN: {barcode}^FS\n"
    zpl += f"^FO90,71^A0N,12,10^FDWHS: {whs_skuid}^FS\n"
    
    # ── COLUNA 2 (Direita) ── - Offset aumentado para 350
    if not is_single:
        zpl += f"^FO350,5^A0N,18,18^FD{name_line}^FS\n"
        zpl += f"^FO350,32^BQN,2,2^FDMA,{barcode}^FS\n"
        zpl += f"^FO430,35^A0N,12,10^FDSKU: {seller_sku}^FS\n"
        zpl += f"^FO430,53^A0N,12,10^FDEAN: {barcode}^FS\n"
        zpl += f"^FO430,71^A0N,12,10^FDWHS: {whs_skuid}^FS\n"
        
    zpl += "^XZ"
    return zpl
