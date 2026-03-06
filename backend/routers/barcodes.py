"""
Barcode master data management.
Allows importing EAN→SKU mapping from an Excel file.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session as DBSession
from database import get_db
from models import Barcode
from io import BytesIO
import openpyxl

router = APIRouter()


@router.post("/import-excel", status_code=200)
async def import_excel(
    file: UploadFile = File(...),
    db: DBSession = Depends(get_db),
):
    """
    Imports EAN barcodes from an Excel file.
    Expected columns (in order): SKU, Descrição, EAN
    """
    content = await file.read()
    wb = openpyxl.load_workbook(BytesIO(content), read_only=True, data_only=True)
    ws = wb.active

    # Load existing barcodes into a set to avoid duplicates
    existing: set[str] = set(r[0] for r in db.query(Barcode.barcode).all())
    added = 0
    skipped = 0

    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or not row[0]:
            continue
        sku = str(row[0]).strip()
        ean = str(row[2]).strip() if row[2] else None

        if not sku or not ean or ean.lower() in ("none", "n/a", ""):
            skipped += 1
            continue

        if ean not in existing:
            db.add(Barcode(barcode=ean, sku=sku, is_primary=True))
            existing.add(ean)
            added += 1
        else:
            skipped += 1

        if sku not in existing:
            db.add(Barcode(barcode=sku, sku=sku, is_primary=False))
            existing.add(sku)

    db.commit()
    return {"added": added, "skipped": skipped}


@router.get("/resolve")
def resolve_barcode(barcode: str = Query(...), db: DBSession = Depends(get_db)):
    b = db.query(Barcode).filter(Barcode.barcode == barcode).first()
    if not b:
        raise HTTPException(404, "Código de barras não encontrado")
    return {"barcode": barcode, "sku": b.sku}


@router.get("/")
def list_barcodes(db: DBSession = Depends(get_db)):
    rows = db.query(Barcode).order_by(Barcode.sku).all()
    return [{"barcode": b.barcode, "sku": b.sku, "is_primary": b.is_primary} for b in rows]
