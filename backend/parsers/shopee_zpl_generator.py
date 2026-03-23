import textwrap

def generate_shopee_zpl(item: dict) -> str:
    """
    Gera o ZPL exclusivo da Shopee validado para Zebra ZD220 (203dpi).
    Layout: 80x25mm (^PW640 ^LL200).
    """
    product_name = item.get("product_name", "").replace('^', '')
    seller_sku = item.get("seller_sku", "")
    barcode = item.get("barcode", "")
    whs_skuid = item.get("whs_skuid", "")
    
    # Limita o nome para não vazar na etiqueta de 40mm (Corta na última palavra inteira)
    name_line = textwrap.wrap(product_name, width=40)[0] if product_name else ""
    
    zpl = (
        "^XA\n"
        "^PW640\n"  # Largura 80mm
        "^LL200\n"  # Altura 25mm
        "^CI28\n"   # Unicode
    )
    
    # ── TOPO (Nome do Produto)
    zpl += f"^FO10,5^A0N,18,18^FD{name_line}^FS\n"
    
    # ── CENTRO (QR Code centrado horizontalmente no bloco de 320px da etiqueta individual)
    # Fator 4 (~140-160 dots). Posição X calculada para centralizar na etiqueta.
    zpl += f"^FO90,30^BQN,2,4^FDQA,{barcode}^FS\n"
    
    # ── RODAPÉ
    zpl += f"^FO10,135^A0N,18,18^FDseller sku: {seller_sku}^FS\n"
    zpl += f"^FO10,155^A0N,18,18^FDbarcode: {barcode}^FS\n"
    zpl += f"^FO10,175^A0N,18,18^FDwhs skuid: {whs_skuid}^FS\n"
    
    zpl += "^XZ"
    
    return zpl
