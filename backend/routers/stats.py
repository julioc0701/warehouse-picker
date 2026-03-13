from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import func
from database import get_db
from models import ScanEvent, Operator

router = APIRouter()

@router.get("/ranking")
def get_operator_ranking(db: DBSession = Depends(get_db)):
    """
    Returns a ranking of operators by total quantity picked.
    Calculated from scan_events (net bipes: scan + scan_box + undo + shortage).
    This attributes work to the person who actually performed the scan.
    """
    results = (
        db.query(
            Operator.name,
            func.sum(ScanEvent.qty_delta).label("total_picked")
        )
        .join(ScanEvent, ScanEvent.operator_id == Operator.id)
        .filter(ScanEvent.event_type.in_(["scan", "scan_box", "undo", "shortage"]))
        .group_by(Operator.name)
        .order_by(func.sum(ScanEvent.qty_delta).desc())
        .limit(20)
        .all()
    )
    
    return [
        {"name": r.name, "total": int(r.total_picked or 0)}
        for r in results
        if (r.total_picked or 0) > 0
    ]
