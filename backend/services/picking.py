"""Core picking business logic."""
from datetime import datetime
from sqlalchemy.orm import Session as DBSession
from models import PickingItem, Barcode, ScanEvent, Session


def get_current_item(db: DBSession, session_id: int) -> PickingItem | None:
    """Return the first non-completed item for this session."""
    return (
        db.query(PickingItem)
        .filter(
            PickingItem.session_id == session_id,
            PickingItem.status.in_(["pending", "in_progress"]),
        )
        .order_by(PickingItem.id)
        .first()
    )


def resolve_barcode(db: DBSession, barcode: str) -> str | None:
    """Return SKU for a barcode, or None if unknown."""
    entry = db.query(Barcode).filter(Barcode.barcode == barcode).first()
    return entry.sku if entry else None


def process_scan(
    db: DBSession,
    session_id: int,
    barcode: str,
    operator_id: int,
) -> dict:
    """
    Main scan handler. Returns a result dict with status and updated item state.
    Possible statuses: ok | complete | excess | unknown_barcode | wrong_sku
    """
    sku = resolve_barcode(db, barcode)

    if sku is None:
        return {"status": "unknown_barcode", "barcode": barcode}

    # Find the item for this SKU in the session
    item = (
        db.query(PickingItem)
        .filter(PickingItem.session_id == session_id, PickingItem.sku == sku)
        .first()
    )
    if item is None:
        return {"status": "unknown_barcode", "barcode": barcode, "sku": sku}

    current = get_current_item(db, session_id)

    # Scanned a different SKU than what's expected
    if current and current.sku != sku:
        return {
            "status": "wrong_sku",
            "scanned_sku": sku,
            "expected_sku": current.sku,
            "item": _item_dict(item),
        }

    # Already at required quantity
    if item.qty_picked >= item.qty_required:
        return {"status": "excess", "item": _item_dict(item)}

    # Valid scan — increment
    item.qty_picked += 1
    item.status = "in_progress"

    log_event(db, session_id, item.id, barcode, operator_id, "scan", 1)

    if item.qty_picked >= item.qty_required:
        item.status = "complete"
        item.completed_at = datetime.utcnow()
        _auto_complete_session(db, session_id)
        db.commit()
        return {"status": "complete", "item": _item_dict(item)}

    db.commit()
    return {"status": "ok", "item": _item_dict(item)}


def process_scan_box(
    db: DBSession,
    session_id: int,
    barcode: str,
    operator_id: int,
) -> dict:
    """
    Box mode scan: one scan marks the entire required quantity as picked.
    Same barcode validation as process_scan (unknown_barcode / wrong_sku / excess).
    """
    sku = resolve_barcode(db, barcode)
    if sku is None:
        return {"status": "unknown_barcode", "barcode": barcode}

    item = (
        db.query(PickingItem)
        .filter(PickingItem.session_id == session_id, PickingItem.sku == sku)
        .first()
    )
    if item is None:
        return {"status": "unknown_barcode", "barcode": barcode, "sku": sku}

    current = get_current_item(db, session_id)
    if current and current.sku != sku:
        return {
            "status": "wrong_sku",
            "scanned_sku": sku,
            "expected_sku": current.sku,
            "item": _item_dict(item),
        }

    if item.qty_picked >= item.qty_required:
        return {"status": "excess", "item": _item_dict(item)}

    # Mark full quantity as picked in one shot
    delta = item.qty_required - item.qty_picked
    item.qty_picked = item.qty_required
    item.status = "complete"
    item.completed_at = datetime.utcnow()

    log_event(db, session_id, item.id, barcode, operator_id, "scan_box", delta)
    _auto_complete_session(db, session_id)
    db.commit()
    return {"status": "complete", "item": _item_dict(item)}


def undo_last_scan(db: DBSession, session_id: int, sku: str, operator_id: int) -> dict:
    item = _get_item(db, session_id, sku)
    if not item or item.qty_picked <= 0:
        return {"status": "nothing_to_undo"}

    item.qty_picked -= 1
    if item.status in ("complete",):
        item.status = "in_progress"
        item.completed_at = None
    if item.qty_picked == 0:
        item.status = "pending"

    log_event(db, session_id, item.id, "UNDO", operator_id, "undo", -1)
    db.commit()
    return {"status": "ok", "item": _item_dict(item)}


def mark_shortage(db: DBSession, session_id: int, sku: str, qty_found: int, operator_id: int) -> dict:
    item = _get_item(db, session_id, sku)
    if not item:
        return {"status": "not_found"}

    item.qty_picked = qty_found
    item.shortage_qty = item.qty_required - qty_found
    item.status = "partial"
    item.completed_at = datetime.utcnow()

    log_event(db, session_id, item.id, "SHORTAGE", operator_id, "shortage", qty_found)
    _auto_complete_session(db, session_id)
    db.commit()
    return {"status": "ok", "item": _item_dict(item)}


def mark_out_of_stock(db: DBSession, session_id: int, sku: str, operator_id: int) -> dict:
    item = _get_item(db, session_id, sku)
    if not item:
        return {"status": "not_found"}

    # Preserve whatever was already scanned; mark the rest as out of stock
    item.shortage_qty = item.qty_required - item.qty_picked
    item.status = "partial" if item.qty_picked > 0 else "out_of_stock"
    item.completed_at = datetime.utcnow()

    log_event(db, session_id, item.id, "OOS", operator_id, "out_of_stock", 0)
    _auto_complete_session(db, session_id)
    db.commit()
    return {"status": "ok", "item": _item_dict(item)}


def reopen_item(db: DBSession, session_id: int, sku: str, operator_id: int) -> dict:
    item = _get_item(db, session_id, sku)
    if not item:
        return {"status": "not_found"}

    item.status = "in_progress" if item.qty_picked > 0 else "pending"
    item.shortage_qty = 0
    item.completed_at = None

    log_event(db, session_id, item.id, "REOPEN", operator_id, "reopen", 0)
    db.commit()
    return {"status": "ok", "item": _item_dict(item)}


def _auto_complete_session(db: DBSession, session_id: int):
    """Mark session as completed when all items are in a terminal state."""
    items = db.query(PickingItem).filter(PickingItem.session_id == session_id).all()
    done = {"complete", "partial", "out_of_stock"}
    if items and all(i.status in done for i in items):
        sess = db.query(Session).filter(Session.id == session_id).first()
        if sess and sess.status != "completed":
            sess.status = "completed"
            sess.completed_at = datetime.utcnow()


def reset_item(db: DBSession, session_id: int, sku: str, operator_id: int) -> dict:
    """Reset a single item back to zero — qty_picked=0, status=pending."""
    item = _get_item(db, session_id, sku)
    if not item:
        return {"status": "not_found"}

    item.qty_picked = 0
    item.shortage_qty = 0
    item.status = "pending"
    item.completed_at = None

    # If session was completed, revert to in_progress
    sess = db.query(Session).filter(Session.id == session_id).first()
    if sess and sess.status == "completed":
        sess.status = "in_progress"
        sess.completed_at = None

    log_event(db, session_id, item.id, "RESET", operator_id, "reset", 0)
    db.commit()
    return {"status": "ok", "item": _item_dict(item)}


def reset_all_items(db: DBSession, session_id: int, operator_id: int) -> dict:
    """Reset every item in a session back to zero."""
    items = db.query(PickingItem).filter(PickingItem.session_id == session_id).all()
    for item in items:
        item.qty_picked = 0
        item.shortage_qty = 0
        item.status = "pending"
        item.completed_at = None
        log_event(db, session_id, item.id, "RESET_ALL", operator_id, "reset_all", 0)

    sess = db.query(Session).filter(Session.id == session_id).first()
    if sess:
        sess.status = "in_progress"
        sess.completed_at = None

    db.commit()
    return {"status": "ok", "items_reset": len(items)}


def add_barcode(db: DBSession, barcode: str, sku: str, operator_id: int) -> dict:
    existing = db.query(Barcode).filter(Barcode.barcode == barcode).first()
    if existing:
        return {"status": "already_exists", "sku": existing.sku}
    entry = Barcode(barcode=barcode, sku=sku, is_primary=False, added_by=operator_id)
    db.add(entry)
    db.commit()
    return {"status": "ok"}


def session_progress(db: DBSession, session_id: int) -> dict:
    items = db.query(PickingItem).filter(PickingItem.session_id == session_id).all()
    total_items = sum(i.qty_required for i in items)
    picked_items = sum(i.qty_picked for i in items)
    done_statuses = {"complete", "partial", "out_of_stock"}
    skus_complete = sum(1 for i in items if i.status in done_statuses)
    return {
        "items_picked": picked_items,
        "items_total": total_items,
        "skus_complete": skus_complete,
        "skus_total": len(items),
    }


def log_event(db, session_id, item_id, barcode, operator_id, event_type, qty_delta):
    ev = ScanEvent(
        session_id=session_id,
        picking_item_id=item_id,
        barcode=barcode,
        operator_id=operator_id,
        event_type=event_type,
        qty_delta=qty_delta,
    )
    db.add(ev)


def _get_item(db: DBSession, session_id: int, sku: str) -> PickingItem | None:
    return (
        db.query(PickingItem)
        .filter(PickingItem.session_id == session_id, PickingItem.sku == sku)
        .first()
    )


def _item_dict(item: PickingItem) -> dict:
    return {
        "id": item.id,
        "sku": item.sku,
        "description": item.description,
        "qty_required": item.qty_required,
        "qty_picked": item.qty_picked,
        "shortage_qty": item.shortage_qty,
        "status": item.status,
        "labels_ready": item.status in ("complete", "partial", "out_of_stock") and item.qty_picked > 0,
    }
