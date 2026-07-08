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
    columns = [row[1] for row in conn.execute("PRAGMA table_info(runs)").fetchall()]
    if "uid" not in columns:
        conn.execute("ALTER TABLE runs ADD COLUMN uid TEXT DEFAULT 'anonymous'")
    conn.commit()
    conn.close()

def save_run(data: dict):
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''
        INSERT OR REPLACE INTO runs (
            id, timestamp, prospect, company, detected_scenario,
            scenario_confidence, scenario_reasoning, research_summary, sources,
            hook, email_draft, email_score, subject_variants, duration, status, uid
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
        data["status"],
        data.get("uid", "anonymous"),
    ))
    conn.commit()
    conn.close()

def get_all_runs(uid: str = None):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    if uid:
        rows = conn.execute(
            "SELECT * FROM runs WHERE uid = ? OR uid = 'anonymous' ORDER BY timestamp DESC",
            (uid,)
        ).fetchall()
    else:
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

def get_existing_run(prospect: str, company: str, uid: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        '''SELECT * FROM runs 
           WHERE LOWER(prospect)=LOWER(?) 
           AND LOWER(company)=LOWER(?) 
           AND (uid = ? OR uid = 'anonymous')
           ORDER BY timestamp DESC LIMIT 1''',
        (prospect, company, uid)
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
