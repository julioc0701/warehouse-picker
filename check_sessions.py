import sqlite3
import os

db_path = "backend/warehouse_v2.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("--- SESSIONS ---")
cur.execute("SELECT id, session_code, marketplace, status FROM sessions ORDER BY id DESC LIMIT 10;")
for row in cur.fetchall():
    print(row)

conn.close()
