from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import func
from database import get_db
from models import Session, PickingItem, Operator

router = APIRouter()

@router.get("/ranking")
def get_operator_ranking(db: DBSession = Depends(get_db)):
    """
    Returns a ranking of operators by total quantity picked.
    Calculated from PickingItem.qty_picked across all sessions assigned to an operator.
    """
    results = (
        db.query(
            Operator.name,
            func.sum(PickingItem.qty_picked).label("total_picked")
        )
        .join(Session, Session.operator_id == Operator.id)
        .join(PickingItem, PickingItem.session_id == Session.id)
        .group_by(Operator.name)
        .order_by(func.sum(PickingItem.qty_picked).desc())
        .all()
    )
    
    return [
        {"name": r.name, "total": int(r.total_picked or 0)}
        for r in results
    ]
