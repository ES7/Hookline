import sqlite3
import json

DB_PATH = "runs.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY,
            timestamp TEXT,
            prospect TEXT,
            company TEXT,
            detected_scenario TEXT,
            scenario_confidence TEXT,
            scenario_reasoning TEXT,
            research_summary TEXT,
            sources TEXT,
            hook TEXT,
            email_draft TEXT,
            email_score TEXT,
            subject_variants TEXT,
            duration REAL,
            status TEXT
        )
    ''')
    conn.commit()
    conn.close()

def save_run(data: dict):
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''
        INSERT OR REPLACE INTO runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ''', (
        data["run_id"],
        data["timestamp"],
        data["prospect"],
        data["company"],
        data.get("detected_scenario", "standard"),
        data.get("scenario_confidence", ""),
        data.get("scenario_reasoning", ""),
        data["research_summary"],
        json.dumps(data.get("sources", [])),
        data["hook"],
        data["email_draft"],
        data.get("email_score", ""),
        json.dumps(data.get("subject_variants", [])),
        data.get("duration", 0),
        data["status"]
    ))
    conn.commit()
    conn.close()

def get_all_runs():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        'SELECT * FROM runs ORDER BY timestamp DESC'
    ).fetchall()
    conn.close()
    result = []
    for row in rows:
        d = dict(row)
        d["id"] = d.get("id") or d.get("run_id")
        try:
            d["sources"] = json.loads(d.get("sources", "[]"))
        except:
            d["sources"] = []
        try:
            d["subject_variants"] = json.loads(d.get("subject_variants", "[]"))
        except:
            d["subject_variants"] = []
        result.append(d)
    return result

def get_existing_run(prospect: str, company: str, manual_override: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        '''SELECT * FROM runs 
           WHERE LOWER(prospect)=LOWER(?) 
           AND LOWER(company)=LOWER(?) 
           ORDER BY timestamp DESC LIMIT 1''',
        (prospect, company)
    ).fetchone()
    conn.close()
    if row:
        d = dict(row)
        d["id"] = d.get("id") or d.get("run_id")
        try:
            d["sources"] = json.loads(d.get("sources", "[]"))
        except:
            d["sources"] = []
        try:
            d["subject_variants"] = json.loads(d.get("subject_variants", "[]"))
        except:
            d["subject_variants"] = []
        return d
    return None
