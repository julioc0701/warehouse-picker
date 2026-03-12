import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import init_db, get_db
from routers import sessions, operators, labels, printers, seed, barcodes, print_jobs
from models import Operator

app = FastAPI(title="NVS API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(operators.router, prefix="/api/operators", tags=["operators"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(labels.router, prefix="/api/labels", tags=["labels"])
app.include_router(printers.router, prefix="/api/printers", tags=["printers"])
app.include_router(seed.router, prefix="/api/test", tags=["seed"])
app.include_router(barcodes.router, prefix="/api/barcodes", tags=["barcodes"])
app.include_router(print_jobs.router, prefix="/api/print-jobs", tags=["print-jobs"])

DEFAULT_OPERATORS = ["Master", "Julio", "Cris", "Rafael", "Luidi", "Weligton", "Cristofer", "Renan"]


@app.on_event("startup")
def on_startup():
    init_db()
    db = next(get_db())
    try:
        for name in DEFAULT_OPERATORS:
            if not db.query(Operator).filter(Operator.name == name).first():
                db.add(Operator(name=name, pin_code="1234"))
        db.commit()
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Serve React frontend (production build)
# This must come AFTER all /api routes
_static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(_static_dir):
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")

