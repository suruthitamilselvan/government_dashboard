import sqlite3

con = sqlite3.connect('citizen_service.db')
con.row_factory = sqlite3.Row

tables = con.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
print('=== TABLES ===')
for t in tables:
    name = t['name']
    cols = con.execute(f'PRAGMA table_info({name})').fetchall()
    count = con.execute(f'SELECT COUNT(*) FROM {name}').fetchone()[0]
    print(f'\n[{name}]  ({count} rows)')
    for c in cols:
        pk  = ' PK'       if c['pk']     else ''
        nn  = ' NOT NULL' if c['notnull'] else ''
        print(f'  {c["cid"]+1:2}. {c["name"]:30} {c["type"]:15}{pk}{nn}')
con.close()
