"""
Barcode master data management.
Allows importing EAN→SKU mapping from an Excel file.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session as DBSession
from database import get_db
from models import Barcode, PickingItem
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
    Expected columns (in order): SKU, EAN  (or SKU, <qualquer coisa>, EAN — coluna B ignorada)
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
        # Column B is ignored — description comes from the picking list (PickingItem)
        ean = str(row[2]).strip() if len(row) > 2 and row[2] else (
              str(row[1]).strip() if len(row) > 1 and row[1] else None)

        if not sku or not ean or ean.lower() in ("none", "n/a", ""):
            skipped += 1
            continue

        # If EAN equals SKU, treat it as a SKU-alias (is_primary=False), not a real barcode
        ean_is_real = ean != sku

        if ean not in existing:
            db.add(Barcode(barcode=ean, sku=sku, is_primary=ean_is_real))
            existing.add(ean)
            if ean_is_real:
                added += 1
            else:
                skipped += 1
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
def list_barcodes(
    db: DBSession = Depends(get_db),
    search: str = Query(default="", description="Filtrar por SKU ou código de barras"),
    limit: int = Query(default=200, le=2000),
):
    # Exclude SKU-alias entries (barcode == sku) throughout
    base = Barcode.barcode != Barcode.sku

    if search:
        like = f"%{search}%"
        # Find all SKUs that match the search (by sku name or by any of their barcodes)
        matching_skus = (
            db.query(Barcode.sku)
            .filter(base, (Barcode.sku.ilike(like)) | (Barcode.barcode.ilike(like)))
            .distinct()
            .subquery()
        )
        rows = (
            db.query(Barcode)
            .filter(base, Barcode.sku.in_(matching_skus))
            .order_by(Barcode.sku, Barcode.is_primary.desc())
            .all()
        )
        total = len({b.sku for b in rows})
    else:
        # Count distinct products (SKUs with at least one primary barcode from import)
        total = (
            db.query(Barcode.sku)
            .filter(base, Barcode.is_primary == True)
            .distinct()
            .count()
        )
        # Get top N SKUs (ordered alphabetically), then fetch all their barcodes
        top_skus = (
            db.query(Barcode.sku)
            .filter(base, Barcode.is_primary == True)
            .distinct()
            .order_by(Barcode.sku)
            .limit(limit)
            .subquery()
        )
        rows = (
            db.query(Barcode)
            .filter(base, Barcode.sku.in_(top_skus))
            .order_by(Barcode.sku, Barcode.is_primary.desc())
            .all()
        )

    # Group by SKU
    grouped: dict[str, dict] = {}
    for b in rows:
        if b.sku not in grouped:
            grouped[b.sku] = {"sku": b.sku, "description": None, "barcodes": []}
        grouped[b.sku]["barcodes"].append({
            "barcode": b.barcode,
            "is_primary": b.is_primary,
            "learned": b.added_by is not None,
        })

    # Enrich with description from PickingItem (description lives in the picking list, not in barcodes)
    if grouped:
        desc_rows = (
            db.query(PickingItem.sku, PickingItem.description)
            .filter(
                PickingItem.sku.in_(grouped.keys()),
                PickingItem.description.isnot(None),
            )
            .distinct(PickingItem.sku)
            .all()
        )
        for sku, desc in desc_rows:
            grouped[sku]["description"] = desc

    return {
        "total": total,
        "results": len(grouped),
        "items": list(grouped.values()),
    }
