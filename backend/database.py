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
    from models import Operator, Session, PickingItem, Barcode, Label, ScanEvent, Printer  # noqa
    Base.metadata.create_all(bind=engine)

    # Lightweight column migrations (SQLite doesn't support DROP COLUMN but ADD is fine)
    from sqlalchemy import text, inspect as sa_inspect
    insp = sa_inspect(engine)
    with engine.connect() as conn:
        cols = [c["name"] for c in insp.get_columns("barcodes")]
        if "description" not in cols:
            conn.execute(text("ALTER TABLE barcodes ADD COLUMN description VARCHAR(500)"))
            conn.commit()
