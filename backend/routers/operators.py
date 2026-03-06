from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession
from database import get_db
from models import Operator

router = APIRouter()


class OperatorCreate(BaseModel):
    name: str
    badge: str | None = None


@router.get("/")
def list_operators(db: DBSession = Depends(get_db)):
    ops = db.query(Operator).all()
    return [{"id": o.id, "name": o.name, "badge": o.badge} for o in ops]


@router.post("/", status_code=201)
def create_operator(body: OperatorCreate, db: DBSession = Depends(get_db)):
    op = Operator(name=body.name, badge=body.badge)
    db.add(op)
    db.commit()
    db.refresh(op)
    return {"id": op.id, "name": op.name, "badge": op.badge}


@router.get("/badge/{badge}")
def get_by_badge(badge: str, db: DBSession = Depends(get_db)):
    op = db.query(Operator).filter(Operator.badge == badge).first()
    if not op:
        raise HTTPException(404, "Badge not found")
    return {"id": op.id, "name": op.name, "badge": op.badge}
