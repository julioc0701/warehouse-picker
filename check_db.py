import sqlite3
import os

db_path = "backend/warehouse_v2.db"
if not os.path.exists(db_path):
    print(f"Error: {db_path} not found")
    exit(1)

conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("--- BATCHES ---")
cur.execute("SELECT id, full_date, status, seq FROM batches LIMIT 20;")
for row in cur.fetchall():
    print(row)

print("\n--- SESSIONS ---")
cur.execute("SELECT id, session_code, batch_id FROM sessions ORDER BY id DESC LIMIT 20;")
for row in cur.fetchall():
    print(row)

conn.close()
