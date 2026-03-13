import asyncio
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession
from database import get_db
from models import Session, PickingItem, Label, Barcode, Operator, ScanEvent
from parsers.pdf_parser import parse_picking_pdf
from parsers.zpl_parser import parse_zpl_file, get_ml_barcodes
from services import picking as svc

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Split helper ─────────────────────────────────────────────────────────────

def split_into_batches(items: list[dict], max_units: int = 1000) -> list[list[dict]]:
    """
    Sort items by qty desc, then greedily fill batches up to max_units.
    Items that alone exceed max_units get their own batch.
    """
    sorted_items = sorted(items, key=lambda x: x["qty_required"], reverse=True)
    batches: list[list[dict]] = []
    current: list[dict] = []
    current_total = 0

    for item in sorted_items:
        qty = item["qty_required"]
        if not current or current_total + qty <= max_units:
            current.append(item)
            current_total += qty
        else:
            batches.append(current)
            current = [item]
            current_total = qty

    if current:
        batches.append(current)

    return batches


# ── Upload ───────────────────────────────────────────────────────────────────

def _clear_all_sessions(db: DBSession):
    """Delete all sessions and their children (picking items, scan events, labels)."""
    item_ids = [r[0] for r in db.query(PickingItem.id).all()]
    if item_ids:
        db.query(ScanEvent).filter(ScanEvent.picking_item_id.in_(item_ids)).delete(synchronize_session=False)
    db.query(Label).delete(synchronize_session=False)
    db.query(PickingItem).delete(synchronize_session=False)
    db.query(Session).delete(synchronize_session=False)


@router.post("/upload", status_code=201)
async def upload_session(
    session_code: str = Form(...),
    picking_pdf: UploadFile = File(...),
    labels_txt: UploadFile | None = File(None),
    db: DBSession = Depends(get_db),
):
    pdf_bytes = await picking_pdf.read()
    txt_content = (await labels_txt.read()).decode("utf-8", errors="replace") if labels_txt else ""

    logger.info("Upload iniciado: session_code=%s pdf=%d bytes txt=%d bytes",
                session_code, len(pdf_bytes), len(txt_content))

    # Roda parsers pesados em thread para não bloquear o event loop do uvicorn
    loop = asyncio.get_event_loop()
    try:
        items_data = await asyncio.wait_for(
            loop.run_in_executor(None, parse_picking_pdf, pdf_bytes),
            timeout=120.0,
        )
    except asyncio.TimeoutError:
        logger.error("Timeout ao processar PDF (%d bytes)", len(pdf_bytes))
        raise HTTPException(408, "PDF demorou mais de 2 min para processar. Verifique o arquivo.")
    except Exception as exc:
        logger.exception("Erro ao parsear PDF")
        raise HTTPException(400, f"Erro ao ler PDF: {exc}")

    labels_data = []
    if txt_content:
        try:
            labels_data = await asyncio.wait_for(
                loop.run_in_executor(None, parse_zpl_file, txt_content),
                timeout=60.0,
            )
        except Exception as exc:
            logger.exception("Erro ao parsear TXT/ZPL")
            raise HTTPException(400, f"Erro ao ler arquivo de etiquetas: {exc}")

    logger.info("Parse concluído: %d itens, %d etiquetas", len(items_data), len(labels_data))

    if not items_data:
        raise HTTPException(400, "Nenhum item encontrado no PDF. Verifique se é uma lista de picking do Mercado Livre.")

    # ── Replace all previous data ──────────────────────────────────────────
    # CUIDADO: _clear_all_sessions() foi re-ativado a pedido do usuario.
    _clear_all_sessions(db)

    # Split items into batches of max 1000 units, sorted by qty desc
    batches = split_into_batches(items_data, max_units=1000)

    # Pre-load existing barcodes to avoid duplicates
    added_barcodes: set[str] = set(r[0] for r in db.query(Barcode.barcode).all())

    def add_barcode_safe(barcode: str, sku: str, is_primary: bool):
        if barcode and barcode not in added_barcodes:
            db.add(Barcode(barcode=barcode, sku=sku, is_primary=is_primary))
            added_barcodes.add(barcode)

    # Build SKU → labels map from ZPL
    sku_labels: dict[str, list] = {}
    for lbl in labels_data:
        sku_labels.setdefault(lbl["sku"], []).append(lbl)

    created_sessions = []
    total_batches = len(batches)

    for idx, batch in enumerate(batches, start=1):
        code = f"{session_code}-L{idx:02d}" if total_batches > 1 else session_code
        sess = Session(session_code=code, operator_id=None, status="open")
        db.add(sess)
        db.flush()

        for item in batch:
            pi = PickingItem(
                session_id=sess.id,
                sku=item["sku"],
                ml_code=item.get("ml_code"),
                description=item.get("description", ""),
                qty_required=item["qty_required"],
            )
            db.add(pi)
            add_barcode_safe(item["sku"], item["sku"], True)
            ean = item.get("ean")
            if ean:
                add_barcode_safe(ean, item["sku"], False)

            # Attach ZPL labels for this SKU to this sub-session
            for lbl in sku_labels.get(item["sku"], []):
                db.add(Label(
                    session_id=sess.id,
                    sku=lbl["sku"],
                    label_index=lbl["label_index"],
                    zpl_content=lbl["zpl_content"],
                ))

        created_sessions.append({"session_id": sess.id, "session_code": code, "items": len(batch)})

    # Register ML codes as barcodes
    for entry in get_ml_barcodes(txt_content):
        add_barcode_safe(entry["ml_code"], entry["sku"], False)

    db.commit()
    return {
        "base_code": session_code,
        "lists_created": len(created_sessions),
        "total_items": len(items_data),
        "sessions": created_sessions,
    }


# ── Claim ─────────────────────────────────────────────────────────────────────

class ClaimBody(BaseModel):
    operator_id: int


@router.post("/{session_id}/claim")
def claim_session(session_id: int, body: ClaimBody, db: DBSession = Depends(get_db)):
    sess = _session_or_404(db, session_id)
    # Já reservada pelo mesmo operador — idempotente, só navega
    if sess.operator_id == body.operator_id:
        return {"session_id": sess.id, "session_code": sess.session_code, "status": sess.status}
    if sess.status != "open" or sess.operator_id is not None:
        raise HTTPException(409, "Lista já está em uso por outro operador")
    sess.operator_id = body.operator_id
    # Não muda status aqui — in_progress só ocorre no primeiro scan
    db.commit()
    return {"session_id": sess.id, "session_code": sess.session_code, "status": sess.status}


# ── List & Get ────────────────────────────────────────────────────────────────

@router.get("/")
def list_sessions(db: DBSession = Depends(get_db)):
    # Para não sobrecarregar com histórico infinito, limitaremos as sessões aqui.
    # Retorna o histórico das últimas 100 sessões criadas.
    sessions = db.query(Session).order_by(Session.id.desc()).limit(100).all()
    # Inverte a lista para mostrar a ordem correta no frontend (antigas primeiro) se necessário,
    # mas o frontend aceita desordenado de forma tranquila.
    operators = {o.id: o.name for o in db.query(Operator).all()}
    result = []
    for s in sessions:
        total = sum(i.qty_required for i in s.items)
        picked = sum(i.qty_picked for i in s.items)
        result.append({
            "id": s.id,
            "session_code": s.session_code,
            "operator_id": s.operator_id,
            "operator_name": operators.get(s.operator_id) if s.operator_id else None,
            "status": s.status,
            "created_at": s.created_at.isoformat(),
            "items_total": total,
            "items_picked": picked,
        })
    return result


@router.get("/find-by-barcode")
def find_by_barcode(
    barcode: str = Query(...),
    operator_id: int = Query(...),
    db: DBSession = Depends(get_db),
):
    """
    Locate a picking item by barcode across all active sessions.
    Returns the best match (highest qty_required) with an action hint.

    Actions:
      open             — item is pending/in_progress, session available to this operator
      already_done     — item is complete/partial/out_of_stock
      in_progress_other — session is claimed by a different operator
      not_found        — barcode not in the Barcode table
      not_in_sessions  — SKU exists but not in any active session
    """
    # 1. Try exact barcode match first
    bc = db.query(Barcode).filter(Barcode.barcode == barcode).first()
    sku = bc.sku if bc else None

    # 2. If no barcode match, try SKU or Description (partial match)
    if not sku:
        like_query = f"%{barcode}%"
        # Search for candidates in PickingItem directly
        from sqlalchemy import case
        candidates_query = (
            db.query(PickingItem, Session, Operator.name.label("operator_name"))
            .join(Session, Session.id == PickingItem.session_id)
            .outerjoin(Operator, Operator.id == Session.operator_id)
            .filter(Session.status != "completed")
            .filter(
                (PickingItem.sku == barcode) | 
                (PickingItem.sku.ilike(like_query)) | 
                (PickingItem.description.ilike(like_query))
            )
            .order_by(
                case((PickingItem.sku == barcode, 1), else_=0).desc(),  # Exact SKU first
                PickingItem.qty_required.desc()                         # Then by volume
            )
        )
        
        matches = candidates_query.all()
        
        if not matches:
             return {"action": "not_found", "barcode": barcode}

        # If the top match is NOT an exact SKU, and there are multiple candidates, return list
        top_item, _, _ = matches[0]
        if top_item.sku != barcode and len(matches) > 1:
            return {
                "action": "multiple_matches",
                "barcode": barcode,
                "candidates": [
                    {
                        "item_id": m[0].id,
                        "sku": m[0].sku,
                        "description": m[0].description,
                        "session_id": m[1].id,
                        "session_code": m[1].session_code,
                        "operator_name": m[2] or "Disponível",
                        "qty_picked": m[0].qty_picked,
                        "qty_required": m[0].qty_required,
                        "status": m[0].status
                    } for m in matches
                ]
            }
        
        # Otherwise, take the first one
        sku = top_item.sku

    # 3. Find all items with this SKU in non-completed sessions, best first
    rows = (
        db.query(PickingItem, Session, Operator)
        .join(Session, Session.id == PickingItem.session_id)
        .outerjoin(Operator, Operator.id == Session.operator_id)
        .filter(
            PickingItem.sku == sku,
            Session.status != "completed",
        )
        .order_by(PickingItem.qty_required.desc())
        .all()
    )

    if not rows:
        # Verificar se o SKU foi concluído em alguma sessão finalizada
        done_rows = (
            db.query(PickingItem, Session, Operator)
            .join(Session, Session.id == PickingItem.session_id)
            .outerjoin(Operator, Operator.id == Session.operator_id)
            .filter(
                PickingItem.sku == sku,
                Session.status == "completed",
                PickingItem.status.in_(["complete", "partial", "out_of_stock"]),
            )
            .order_by(Session.id.desc())
            .first()
        )
        if done_rows:
            done_item, done_session, done_operator = done_rows
            return {
                "action": "already_done",
                "sku": sku,
                "barcode": barcode,
                "best_match": {
                    "session_id": done_session.id,
                    "session_code": done_session.session_code,
                    "item_status": done_item.status,
                    "qty_required": done_item.qty_required,
                    "qty_picked": done_item.qty_picked,
                    "description": done_item.description,
                    "operator_id": done_operator.id if done_operator else None,
                    "operator_name": done_operator.name if done_operator else None,
                },
            }
        return {"action": "not_in_sessions", "sku": sku, "barcode": barcode}

    item, session, operator = rows[0]

    match = {
        "session_id": session.id,
        "session_code": session.session_code,
        "item_status": item.status,
        "qty_required": item.qty_required,
        "qty_picked": item.qty_picked,
        "description": item.description,
        "operator_id": operator.id if operator else None,
        "operator_name": operator.name if operator else None,
        "item_id": item.id
    }

    # 3. Determine action
    terminal = {"complete", "partial", "out_of_stock"}
    if item.status in terminal:
        action = "already_done"
    elif session.operator_id and session.operator_id != operator_id:
        if item.qty_picked == 0:
            action = "transfer_available"
        else:
            action = "in_progress_other"
    else:
        action = "open"

    return {
        "action": action, 
        "sku": item.sku, 
        "barcode": barcode, 
        "best_match": match,
        "item_id": item.id if action == "transfer_available" else item.id,
        "owner_name": operator.name if (operator and action == "transfer_available") else None
    }


@router.get("/shortage-report")
def shortage_report(db: DBSession = Depends(get_db)):
    """
    Retorna todos os SKUs com falta (shortage_qty > 0) de todas as sessões
    (em andamento e concluídas), agregados por SKU.
    """
    from sqlalchemy import func

    rows = (
        db.query(
            PickingItem.sku,
            PickingItem.description,
            func.sum(PickingItem.shortage_qty).label("total_shortage"),
        )
        .join(Session, Session.id == PickingItem.session_id)
        .filter(
            PickingItem.shortage_qty > 0,
        )
        .group_by(PickingItem.sku, PickingItem.description)
        .order_by(func.sum(PickingItem.shortage_qty).desc())
        .all()
    )

    return [
        {"sku": r.sku, "description": r.description, "shortage_qty": r.total_shortage}
        for r in rows
    ]


@router.get("/{session_id}")
def get_session(session_id: int, db: DBSession = Depends(get_db)):
    s = _session_or_404(db, session_id)
    progress = svc.session_progress(db, session_id)
    current = svc.get_current_item(db, session_id)
    return {
        "id": s.id,
        "session_code": s.session_code,
        "operator_id": s.operator_id,
        "status": s.status,
        "progress": progress,
        "current_item": svc._item_dict(current) if current else None,
    }


@router.get("/{session_id}/items")
def list_items(session_id: int, db: DBSession = Depends(get_db)):
    _session_or_404(db, session_id)
    items = db.query(PickingItem).filter(PickingItem.session_id == session_id).all()
    return [svc._item_dict(i) for i in items]


# ── Scan & Actions ────────────────────────────────────────────────────────────

class ScanBody(BaseModel):
    barcode: str
    operator_id: int
    focus_sku: str | None = None


@router.post("/{session_id}/scan")
def scan(session_id: int, body: ScanBody, db: DBSession = Depends(get_db)):
    _session_or_404(db, session_id)
    result = svc.process_scan(db, session_id, body.barcode, body.operator_id, body.focus_sku)
    result["progress"] = svc.session_progress(db, session_id)
    return result


@router.post("/{session_id}/scan-box")
def scan_box(session_id: int, body: ScanBody, db: DBSession = Depends(get_db)):
    """Box mode: one scan marks the full required quantity as picked."""
    _session_or_404(db, session_id)
    result = svc.process_scan_box(db, session_id, body.barcode, body.operator_id, body.focus_sku)
    result["progress"] = svc.session_progress(db, session_id)
    return result


class UndoBody(BaseModel):
    sku: str
    operator_id: int


@router.post("/{session_id}/undo")
def undo(session_id: int, body: UndoBody, db: DBSession = Depends(get_db)):
    result = svc.undo_last_scan(db, session_id, body.sku, body.operator_id)
    result["progress"] = svc.session_progress(db, session_id)
    return result


class ShortageBody(BaseModel):
    sku: str
    qty_found: int
    operator_id: int


@router.post("/{session_id}/shortage")
def shortage(session_id: int, body: ShortageBody, db: DBSession = Depends(get_db)):
    result = svc.mark_shortage(db, session_id, body.sku, body.qty_found, body.operator_id)
    result["progress"] = svc.session_progress(db, session_id)
    return result


class OosBody(BaseModel):
    sku: str
    operator_id: int


@router.post("/{session_id}/out-of-stock")
def out_of_stock(session_id: int, body: OosBody, db: DBSession = Depends(get_db)):
    result = svc.mark_out_of_stock(db, session_id, body.sku, body.operator_id)
    result["progress"] = svc.session_progress(db, session_id)
    return result


class ReopenBody(BaseModel):
    sku: str
    operator_id: int


@router.post("/{session_id}/reopen")
def reopen(session_id: int, body: ReopenBody, db: DBSession = Depends(get_db)):
    result = svc.reopen_item(db, session_id, body.sku, body.operator_id)
    result["progress"] = svc.session_progress(db, session_id)
    return result


class ResetItemBody(BaseModel):
    sku: str
    operator_id: int


@router.post("/{session_id}/reset-item")
def reset_item(session_id: int, body: ResetItemBody, db: DBSession = Depends(get_db)):
    """Reset a single picking item back to qty=0 / pending."""
    _session_or_404(db, session_id)
    result = svc.reset_item(db, session_id, body.sku, body.operator_id)
    result["progress"] = svc.session_progress(db, session_id)
    return result


class ResetAllBody(BaseModel):
    operator_id: int


@router.post("/{session_id}/reset-all-items")
def reset_all_items(session_id: int, body: ResetAllBody, db: DBSession = Depends(get_db)):
    """Reset every item in the session back to qty=0 / pending."""
    _session_or_404(db, session_id)
    result = svc.reset_all_items(db, session_id, body.operator_id)
    result["progress"] = svc.session_progress(db, session_id)
    return result


class AddBarcodeBody(BaseModel):
    barcode: str
    sku: str
    operator_id: int


@router.post("/{session_id}/add-barcode")
def add_barcode(session_id: int, body: AddBarcodeBody, db: DBSession = Depends(get_db)):
    return svc.add_barcode(db, body.barcode, body.sku, body.operator_id)


# ── Reopen session ────────────────────────────────────────────────────────────

@router.post("/{session_id}/reopen-session", status_code=200)
def reopen_session(session_id: int, db: DBSession = Depends(get_db)):
    sess = _session_or_404(db, session_id)
    if sess.status not in ("completed", "in_progress"):
        raise HTTPException(409, "Apenas listas concluídas ou em andamento podem ser reinicializadas")
    sess.status = "open"
    sess.operator_id = None
    sess.completed_at = None
    db.commit()
    return {"session_id": sess.id, "status": "open"}


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{session_id}", status_code=200)
def delete_session(session_id: int, db: DBSession = Depends(get_db)):
    sess = _session_or_404(db, session_id)
    if sess.status == "in_progress":
        raise HTTPException(409, "Não é possível excluir uma lista em andamento")
    # Delete children in FK order
    item_ids = [i.id for i in db.query(PickingItem.id).filter(PickingItem.session_id == session_id).all()]
    if item_ids:
        db.query(ScanEvent).filter(ScanEvent.picking_item_id.in_(item_ids)).delete(synchronize_session=False)
    db.query(Label).filter(Label.session_id == session_id).delete(synchronize_session=False)
    db.query(PickingItem).filter(PickingItem.session_id == session_id).delete(synchronize_session=False)
    db.delete(sess)
    db.commit()
    return {"status": "ok"}


class TransferBody(BaseModel):
    item_id: int
    operator_id: int

@router.post("/transfer", status_code=201)
def transfer_item_api(body: TransferBody, db: DBSession = Depends(get_db)):
    """
    Endpoint to trigger an item reallocation.
    Used by both scan auto-transfer and Supervisor manual transfer.
    """
    try:
        new_sess = svc.reallocate_item(db, body.item_id, body.operator_id)
        return {
            "status": "ok",
            "new_session_id": new_sess.id,
            "new_session_code": new_sess.session_code
        }
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("Erro ao transferir item")
        raise HTTPException(500, "Erro interno ao processar transferência")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _session_or_404(db: DBSession, session_id: int) -> Session:
    s = db.query(Session).filter(Session.id == session_id).first()
    if not s:
        raise HTTPException(404, "Sessão não encontrada")
    return s
