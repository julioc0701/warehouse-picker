import os
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# In production (Railway), set DATABASE_URL=sqlite:////data/warehouse_v2.db
# and mount a persistent volume at /data
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./warehouse_v2.db")
print(f"--- DATABASE DEBUG: URL is '{DATABASE_URL}' ---")

# Robust automated migration (Seed)
if "/data/" in DATABASE_URL:
    if DATABASE_URL.startswith("sqlite:////"):
        db_path = DATABASE_URL.replace("sqlite:////", "/")
    else:
        db_path = DATABASE_URL.replace("sqlite:///", "")
    
    db_path = os.path.abspath(db_path)
    print(f"--- DATABASE DEBUG: Final target path is '{db_path}' ---")
    
    # Check if target exists and its size
    if os.path.exists(db_path):
        size = os.path.getsize(db_path)
        print(f"--- DATABASE DEBUG: Target file exists. Size: {size} bytes ---")
    else:
        print("--- DATABASE DEBUG: Target file does NOT exist. ---")

    raw_force_seed = os.getenv("FORCE_SEED", "false")
    print(f"--- DATABASE DEBUG: Raw FORCE_SEED value is '{raw_force_seed}' ---")
    force_seed = raw_force_seed.lower() in ("true", "1", "yes")
    
    # Also seed if the target is suspiciously small (like an empty SQLite file)
    is_empty_ish = os.path.exists(db_path) and os.path.getsize(db_path) < 20000 
    
    if not os.path.exists(db_path) or force_seed or is_empty_ish:
        import shutil
        current_dir = os.path.dirname(__file__)
        seed_path = os.path.abspath(os.path.join(current_dir, "warehouse_v2.db"))
        print(f"--- DATABASE DEBUG: Looking for seed source at '{seed_path}' ---")
        
        # List files in backend/ to be sure
        files_in_backend = os.listdir(current_dir)
        print(f"--- DATABASE DEBUG: Files in {current_dir}: {files_in_backend} ---")
        
        if os.path.exists(seed_path):
            try:
                print(f"--- SEED: Copying {seed_path} ({os.path.getsize(seed_path)} bytes) to {db_path} ---")
                os.makedirs(os.path.dirname(db_path), exist_ok=True)
                shutil.copy2(seed_path, db_path)
                print(f"--- SEED: Success! New size at target: {os.path.getsize(db_path)} bytes ---")
            except Exception as e:
                print(f"--- SEED ERROR: Failed to copy: {e} ---")
        else:
            print(f"--- SEED ERROR: Seed file '{seed_path}' not found in the repo! ---")
    else:
        print(f"--- DATABASE DEBUG: Data seems healthy at {db_path}, skipping seed. ---")

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
