from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession
from database import get_db
from services.printer import print_labels_for_sku

router = APIRouter()


class PrintRequest(BaseModel):
    session_id: int
    sku: str
    printer_id: int


@router.post("/print")
def print_labels(body: PrintRequest, db: DBSession = Depends(get_db)):
    result = print_labels_for_sku(db, body.session_id, body.sku, body.printer_id)
    if result["status"] == "error":
        raise HTTPException(400, result["message"])
    return result
