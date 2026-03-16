import os
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# In production (Railway), set DATABASE_URL=sqlite:////data/warehouse_v2.db
# and mount a persistent volume at /data
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./warehouse_v2.db")
print(f"--- DATABASE DEBUG: URL is '{DATABASE_URL}' ---")

# Robust automated migration (Seed)
# We check if the DB path is in a common persistent volume location (/data)
if "/data/" in DATABASE_URL:
    # Extract path from URL (handles sqlite:/// or sqlite:////)
    clean_path = DATABASE_URL
    for prefix in ["sqlite:////", "sqlite:///"]:
        if clean_path.startswith(prefix):
            clean_path = clean_path[len(prefix):]
            break
    
    db_path = os.path.abspath(clean_path)
    print(f"--- DATABASE DEBUG: Target path is '{db_path}' ---")
    
    if not os.path.exists(db_path):
        import shutil
        seed_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "warehouse_v2.db"))
        print(f"--- DATABASE DEBUG: Checking for seed at '{seed_path}' ---")
        
        if os.path.exists(seed_path):
            try:
                print(f"--- SEED: Copying {seed_path} to {db_path} ---")
                os.makedirs(os.path.dirname(db_path), exist_ok=True)
                shutil.copy2(seed_path, db_path)
                print("--- SEED: Success! ---")
            except Exception as e:
                print(f"--- SEED ERROR: Failed to copy: {e} ---")
        else:
            # List files in current dir to help debug
            files_here = os.listdir(os.path.dirname(__file__))
            print(f"--- SEED ERROR: Seed file not found. Files in backend: {files_here} ---")
    else:
        print(f"--- DATABASE DEBUG: File already exists at {db_path}, skipping seed. ---")

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

        op_cols = [c["name"] for c in insp.get_columns("operators")]
        if "pin_code" not in op_cols:
            conn.execute(text("ALTER TABLE operators ADD COLUMN pin_code VARCHAR(20) NOT NULL DEFAULT '1234'"))
            conn.commit()

        picking_cols = [c["name"] for c in insp.get_columns("picking_items")]
        if "ml_code" not in picking_cols:
            conn.execute(text("ALTER TABLE picking_items ADD COLUMN ml_code VARCHAR(100)"))
            conn.commit()
        if "labels_printed" not in picking_cols:
            conn.execute(text("ALTER TABLE picking_items ADD COLUMN labels_printed BOOLEAN NOT NULL DEFAULT 0"))
            conn.commit()
