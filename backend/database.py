import os
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# In production (Railway), set DATABASE_URL=sqlite:////data/warehouse.db
# and mount a persistent volume at /data
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./warehouse.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from models import Operator, Session, PickingItem, Barcode, Label, ScanEvent, Printer, PrintJob  # noqa
    Base.metadata.create_all(bind=engine)

    # Lightweight column migrations (SQLite doesn't support DROP COLUMN but ADD is fine)
    from sqlalchemy import text, inspect as sa_inspect
    insp = sa_inspect(engine)
    with engine.connect() as conn:
        cols = [c["name"] for c in insp.get_columns("barcodes")]
        if "description" not in cols:
            conn.execute(text("ALTER TABLE barcodes ADD COLUMN description VARCHAR(500)"))
            conn.commit()

        picking_cols = [c["name"] for c in insp.get_columns("picking_items")]
        if "ml_code" not in picking_cols:
            conn.execute(text("ALTER TABLE picking_items ADD COLUMN ml_code VARCHAR(100)"))
            conn.commit()
        if "labels_printed" not in picking_cols:
            conn.execute(text("ALTER TABLE picking_items ADD COLUMN labels_printed BOOLEAN NOT NULL DEFAULT 0"))
            conn.commit()
