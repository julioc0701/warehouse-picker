from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession
from database import get_db
from models import Label
from services.printer import print_labels_for_sku

router = APIRouter()


class PrintRequest(BaseModel):
    session_id: int
    sku: str
    printer_id: int


@router.post("/print")
def print_labels(body: PrintRequest, db: DBSession = Depends(get_db)):
    """Send labels via TCP socket to a network Zebra printer (legacy / fallback)."""
    result = print_labels_for_sku(db, body.session_id, body.sku, body.printer_id)
    if result["status"] == "error":
        raise HTTPException(400, result["message"])
    return result


@router.get("/zpl")
def get_zpl(
    session_id: int = Query(...),
    sku: str = Query(...),
    db: DBSession = Depends(get_db),
):
    """
    Return the raw ZPL blocks stored for a session+SKU.
    Used by the browser-side local print agent flow.
    """
    labels = (
        db.query(Label)
        .filter(Label.session_id == session_id, Label.sku == sku)
        .order_by(Label.label_index)
        .all()
    )
    if not labels:
        raise HTTPException(404, "Nenhuma etiqueta encontrada para este SKU")

    return {
        "sku": sku,
        "count": len(labels),
        "all_printed": all(lb.printed for lb in labels),
        "zpl_blocks": [lb.zpl_content for lb in labels],
    }


class MarkPrintedBody(BaseModel):
    session_id: int
    sku: str


@router.post("/mark-printed")
def mark_printed(body: MarkPrintedBody, db: DBSession = Depends(get_db)):
    """Mark all labels for a session+SKU as printed (called after local agent succeeds)."""
    labels = (
        db.query(Label)
        .filter(Label.session_id == body.session_id, Label.sku == body.sku)
        .all()
    )
    if not labels:
        raise HTTPException(404, "Nenhuma etiqueta encontrada")

    now = datetime.utcnow()
    for lb in labels:
        lb.printed = True
        lb.printed_at = now
    db.commit()
    return {"status": "ok", "count": len(labels)}
