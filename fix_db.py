import sqlite3
import re

db = sqlite3.connect('C:/Users/julio/OneDrive/Documentos/Antigra/warehouse-picker/warehouse_v2.db')
c = db.cursor()

c.execute("SELECT id, zpl_content FROM labels WHERE zpl_content LIKE '%^LH0,0%'")
rows = c.fetchall()

updated = 0
for r in rows:
    zpl = r[1]
    zpl = re.sub(r'\^LH0,0', '^LH25,0', zpl, flags=re.IGNORECASE)
    c.execute('UPDATE labels SET zpl_content = ? WHERE id = ?', (zpl, r[0]))
    updated += 1

db.commit()
print(f"Fixed {updated} labels with offset in database.")
