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

    raw_force_seed = str(os.getenv("FORCE_SEED", "false")).strip().lower()
    print(f"--- DATABASE DEBUG: Raw FORCE_SEED value is '{raw_force_seed}' ---")
    force_seed = raw_force_seed in ("true", "1", "yes")
    
    # Nuclear option: if the file is smaller than our known good local DB, it's probably wrong
    # Local is ~110KB. If it's <50KB, it's definitely not the right data.
    is_too_small = os.path.exists(db_path) and os.path.getsize(db_path) < 50000
    
    if not os.path.exists(db_path) or force_seed or is_too_small:
        import shutil
        current_dir = os.path.dirname(__file__)
        seed_path = os.path.abspath(os.path.join(current_dir, "warehouse_v2.db"))
        print(f"--- DATABASE DEBUG: Looking for seed source at '{seed_path}' ---")
        
        if os.path.exists(seed_path):
            try:
                print(f"--- SEED: Copying repo DB ({os.path.getsize(seed_path)} bytes) to volume ({db_path}) ---")
                os.makedirs(os.path.dirname(db_path), exist_ok=True)
                shutil.copy2(seed_path, db_path)
                print(f"--- SEED DONE: Success! Size: {os.path.getsize(db_path)} bytes ---")
            except Exception as e:
                print(f"--- SEED ERROR: Failed to copy: {e} ---")
        else:
             print(f"--- SEED ERROR: Source '{seed_path}' not found in bundle! ---")
    else:
        print(f"--- DATABASE DEBUG: Data exists ({os.path.getsize(db_path)} bytes). skipping seed. ---")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# DEBUG: Check table counts immediately on startup
try:
    with engine.connect() as conn:
        from sqlalchemy import text
        # Check if tables exist first
        res = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='operators'")).fetchone()
        if res:
            op_count = conn.execute(text("SELECT COUNT(*) FROM operators")).scalar()
            sess_count = conn.execute(text("SELECT COUNT(*) FROM sessions")).scalar()
            sku_count = conn.execute(text("SELECT COUNT(*) FROM barcodes")).scalar()
            print(f"--- DATA VERIFICATION ---")
            print(f"--- Total Operators: {op_count} ---")
            print(f"--- Total Sessions: {sess_count} ---")
            print(f"--- Total Barcodes: {sku_count} ---")
            print(f"-------------------------")
        else:
            print("--- DATA VERIFICATION: Tables not found yet! ---")
except Exception as e:
    print(f"--- DATA VERIFICATION ERROR: {e} ---")


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

        # Fix UNIQUE constraint on barcode since SQLite doesn't support DROP CONSTRAINT directly
        tbl_sql = conn.execute(text("SELECT sql FROM sqlite_master WHERE type='table' AND name='barcodes'")).scalar()
        idx_sql = conn.execute(text("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='barcodes' AND sql LIKE '%UNIQUE%'")).scalar()
        
        needs_migration = False
        if tbl_sql and "UNIQUE (barcode)" in tbl_sql:
            needs_migration = True
        if idx_sql:
            needs_migration = True
            
        if needs_migration:
            print("--- DATABASE MIGRATION: Removing UNIQUE constraint from barcodes ---")
            conn.execute(text("""
            CREATE TABLE barcodes_tmp (
                id INTEGER NOT NULL PRIMARY KEY,
                barcode VARCHAR(200) NOT NULL,
                sku VARCHAR(100) NOT NULL,
                description VARCHAR(500),
                is_primary BOOLEAN NOT NULL,
                added_by INTEGER,
                added_at DATETIME NOT NULL,
                FOREIGN KEY(added_by) REFERENCES operators (id)
            )
            """))
            conn.execute(text("INSERT INTO barcodes_tmp SELECT id, barcode, sku, description, is_primary, added_by, added_at FROM barcodes"))
            conn.execute(text("DROP TABLE barcodes"))
            conn.execute(text("ALTER TABLE barcodes_tmp RENAME TO barcodes"))
            conn.commit()
            print("--- DATABASE MIGRATION: UNIQUE constraint removed successfully ---")

