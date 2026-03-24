import textwrap

def generate_shopee_paired_zpl(item: dict, is_single: bool = False) -> str:
    """
    Gera blocos ZPL para Shopee em colunas duplas (2-up) para não desperdiçar papel.
    """
    product_name = item.get("product_name", "").replace('^', '')
    seller_sku = item.get("seller_sku", "")
    barcode = item.get("barcode", "")
    whs_skuid = item.get("whs_skuid", "")
    
    name_line = textwrap.wrap(product_name, width=40)[0] if product_name else ""
    
    zpl = "^XA\n^CI28\n"
    
    # Esquerda (X base 10)
    zpl += "^LH0,0\n"
    zpl += f"^FO10,5^A0N,18,18^FD{name_line}^FS\n"
    zpl += f"^FO90,30^BQN,2,4^FDQA,{barcode}^FS\n"
    zpl += f"^FO10,135^A0N,18,18^FDseller sku: {seller_sku}^FS\n"
    zpl += f"^FO10,155^A0N,18,18^FDbarcode: {barcode}^FS\n"
    zpl += f"^FO10,175^A0N,18,18^FDwhs skuid: {whs_skuid}^FS\n"
    
    # Direita (X base 330)
    if not is_single:
        zpl += "^CI28\n^LH0,0\n"
        zpl += f"^FO330,5^A0N,18,18^FD{name_line}^FS\n"
        zpl += f"^FO410,30^BQN,2,4^FDQA,{barcode}^FS\n"
        zpl += f"^FO330,135^A0N,18,18^FDseller sku: {seller_sku}^FS\n"
        zpl += f"^FO330,155^A0N,18,18^FDbarcode: {barcode}^FS\n"
        zpl += f"^FO330,175^A0N,18,18^FDwhs skuid: {whs_skuid}^FS\n"
        
    zpl += "^XZ"
    return zpl
