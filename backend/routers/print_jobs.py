"""
Fila de impressão — print_jobs
================================
GET  /print-jobs/pending          → agente local: busca jobs PENDING
PATCH /print-jobs/{id}            → agente local: atualiza status
GET  /print-jobs?session_id=&sku= → frontend: consulta status do job atual
POST /print-jobs                  → frontend: cria job com ZPL gerado
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession
from database import get_db
from models import PrintJob, PickingItem

router = APIRouter()


# ---------------------------------------------------------------------------
# Agente: busca jobs pendentes
# ---------------------------------------------------------------------------

@router.get("/pending")
def get_pending_jobs(db: DBSession = Depends(get_db)):
    from datetime import timedelta

    # Crash recovery: se ficou PRINTING por mais de 3 min, volta para PENDING
    cutoff = datetime.utcnow() - timedelta(minutes=3)
    stale_count = (
        db.query(PrintJob)
        .filter(PrintJob.status == "PRINTING", PrintJob.created_at < cutoff)
        .update({"status": "PENDING", "error_msg": "Timeout no agente"}, synchronize_session=False)
    )
    if stale_count:
        db.commit()

    jobs = (
        db.query(PrintJob)
        .filter(PrintJob.status == "PENDING")
        .order_by(PrintJob.created_at)
        .limit(20)  # Evita carregar milhares de uma vez
        .all()
    )
    # Retorna o dicionário LITE (sem o zpl_content pesado)
    return [_job_dict_lite(j) for j in jobs]


@router.get("/{job_id}")
def get_job_by_id(job_id: int, db: DBSession = Depends(get_db)):
    job = db.query(PrintJob).filter(PrintJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job não encontrado")
    return _job_dict(job)


# ---------------------------------------------------------------------------
# Agente: atualiza status do job
# ---------------------------------------------------------------------------

class UpdateJobBody(BaseModel):
    status: str
    printer_name: str | None = None
    error_msg: str | None = None


@router.patch("/{job_id}")
def update_job(job_id: int, body: UpdateJobBody, db: DBSession = Depends(get_db)):
    job = db.query(PrintJob).filter(PrintJob.id == job_id).with_for_update().first()
    if not job:
        raise HTTPException(404, "Job não encontrado")

    # Regras de transição de status (Simula um lock / reserva de job)
    if body.status == "PRINTING" and job.status != "PENDING":
        raise HTTPException(400, f"Job {job_id} ja esta sendo processado ou concluido (status: {job.status})")

    valid = {"PRINTING", "PRINTED", "ERROR", "PENDING"}
    if body.status not in valid:
        raise HTTPException(400, f"Status inválido. Use: {valid}")

    job.status = body.status
    if body.printer_name:
        job.printer_name = body.printer_name
    if body.error_msg:
        job.error_msg = body.error_msg

    if body.status == "PRINTED":
        job.printed_at = datetime.utcnow()
        # Marca o PickingItem como impresso
        item = db.query(PickingItem).filter(
            PickingItem.session_id == job.session_id,
            PickingItem.sku == job.sku,
        ).first()
        if item:
            item.labels_printed = True

    db.commit()
    return _job_dict(job)


# ---------------------------------------------------------------------------
# Frontend: consulta status do job mais recente para session+sku
# ---------------------------------------------------------------------------

@router.get("")
def get_job_status(
    session_id: int = Query(...),
    sku: str = Query(...),
    db: DBSession = Depends(get_db),
):
    job = (
        db.query(PrintJob)
        .filter(PrintJob.session_id == session_id, PrintJob.sku == sku)
        .order_by(PrintJob.id.desc())
        .first()
    )
    if not job:
        return None
    return _job_dict(job)


# ---------------------------------------------------------------------------
# Frontend: cria job com ZPL gerado dinamicamente
# ---------------------------------------------------------------------------

class CreateJobBody(BaseModel):
    session_id: int
    sku: str
    zpl_content: str
    operator_id: int | None = None


@router.post("")
def create_job(body: CreateJobBody, db: DBSession = Depends(get_db)):
    if not body.zpl_content.strip():
        raise HTTPException(400, "ZPL vazio")

    # Cancela jobs anteriores com erro para permitir retry
    db.query(PrintJob).filter(
        PrintJob.session_id == body.session_id,
        PrintJob.sku == body.sku,
        PrintJob.status == "ERROR",
    ).delete()

    # Bloqueia duplicata em andamento
    active = (
        db.query(PrintJob)
        .filter(
            PrintJob.session_id == body.session_id,
            PrintJob.sku == body.sku,
            PrintJob.status.in_(["PENDING", "PRINTING"]),
        )
        .first()
    )
    if active:
        return _job_dict(active)

    job = PrintJob(
        session_id=body.session_id,
        sku=body.sku,
        zpl_content=body.zpl_content,
        operator_id=body.operator_id,
        status="PENDING",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return _job_dict(job)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _job_dict(job: PrintJob) -> dict:
    d = _job_dict_lite(job)
    d["zpl_content"] = job.zpl_content
    return d


def _job_dict_lite(job: PrintJob) -> dict:
    return {
        "id": job.id,
        "session_id": job.session_id,
        "sku": job.sku,
        "status": job.status,
        "printer_name": job.printer_name,
        "error_msg": job.error_msg,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "printed_at": job.printed_at.isoformat() if job.printed_at else None,
    }
