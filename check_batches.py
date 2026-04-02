import sqlite3

db_path = "backend/warehouse_v2.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("--- ACTIVE BATCHES ---")
cur.execute("SELECT id, name, status FROM batches WHERE status = 'active' ORDER BY id ASC;")
for row in cur.fetchall():
    print(row)

print("--- ALL BATCHES ---")
cur.execute("SELECT id, name, status FROM batches ORDER BY id DESC LIMIT 10;")
for row in cur.fetchall():
    print(row)

conn.close()
