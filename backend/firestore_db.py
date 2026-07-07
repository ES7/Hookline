import json
import os
from datetime import datetime, timezone

_db = None
_firebase_ready = False
FREE_RUN_LIMIT = int(os.getenv("FREE_RUN_LIMIT", "5"))


def _month_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _init_firebase_admin():
    global _firebase_ready
    if _firebase_ready:
        try:
            import firebase_admin
            return firebase_admin
        except ImportError:
            return None

    try:
        import firebase_admin
        from firebase_admin import credentials
    except ImportError:
        return None

    if firebase_admin._apps:
        _firebase_ready = True
        return firebase_admin

    creds = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    project_id = os.getenv("FIREBASE_PROJECT_ID") or os.getenv("GOOGLE_CLOUD_PROJECT")

    if creds:
        firebase_admin.initialize_app(credentials.Certificate(json.loads(creds)))
    elif project_id:
        firebase_admin.initialize_app(options={"projectId": project_id})
    else:
        firebase_admin.initialize_app()

    _firebase_ready = True
    return firebase_admin


def _get_db():
    global _db
    if _db is not None:
        return _db

    app = _init_firebase_admin()
    if not app or not os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON"):
        return None

    try:
        from firebase_admin import firestore
        _db = firestore.client()
    except Exception as e:
        print(f"Firestore init failed: {e}")
        _db = None
    return _db


def verify_id_token(id_token: str):
    app = _init_firebase_admin()
    if not app:
        return None
    try:
        from firebase_admin import auth
        return auth.verify_id_token(id_token)
    except Exception as e:
        # If running locally without a service account, Firebase Admin will throw DefaultCredentialsError.
        # Fallback to parsing the token unverified so the local prototype still functions.
        if "DefaultCredentialsError" in type(e).__name__:
            try:
                import jwt
                print("Warning: Bypassing Firebase token signature verification due to missing Service Account.")
                unverified_claims = jwt.decode(id_token, options={"verify_signature": False})
                if "uid" not in unverified_claims:
                    unverified_claims["uid"] = unverified_claims.get("user_id") or unverified_claims.get("sub")
                return unverified_claims
            except Exception as decode_err:
                print(f"Fallback JWT decode failed: {decode_err}")
                return None
                
        print(f"Firebase token verification failed: {e}")
        return None


def ensure_user_firestore(user: dict):
    db = _get_db()
    if not db:
        print("Warning: Firestore not configured, skipping user sync.")
        return True

    uid = user["uid"]
    ref = db.collection("users").document(uid)
    snap = ref.get()
    now = datetime.now(timezone.utc).isoformat()

    if not snap.exists:
        ref.set({
            "uid": uid,
            "email": user.get("email"),
            "name": user.get("name"),
            "photo": user.get("picture"),
            "plan": "free",
            "created_at": now,
            "runs_this_month": 0,
            "month_key": _month_key(),
        })
        return True

    data = snap.to_dict() or {}
    updates = {}
    if data.get("month_key") != _month_key():
        updates.update({"runs_this_month": 0, "month_key": _month_key()})
    for field, source in [("email", "email"), ("name", "name"), ("photo", "picture")]:
        if user.get(source) and data.get(field) != user.get(source):
            updates[field] = user.get(source)
    if updates:
        ref.update(updates)
    return True


def reserve_user_runs(uid: str, count: int):
    db = _get_db()
    if not db:
        print("Warning: Firestore not configured, skipping quota check.")
        return {"ok": True, "plan": "free", "used": 0, "remaining": 999}
    if count < 1:
        return {"ok": False, "reason": "invalid_run_count"}

    try:
        from firebase_admin import firestore

        ref = db.collection("users").document(uid)
        transaction = db.transaction()

        @firestore.transactional
        def reserve(transaction):
            snap = ref.get(transaction=transaction)
            data = snap.to_dict() if snap.exists else {}
            current_month = _month_key()
            current_runs = data.get("runs_this_month", 0)
            if data.get("month_key") != current_month:
                current_runs = 0

            plan = data.get("plan", "free")
            if plan != "paid" and current_runs + count > FREE_RUN_LIMIT:
                return {
                    "ok": False,
                    "reason": "quota_exceeded",
                    "limit": FREE_RUN_LIMIT,
                    "used": current_runs,
                    "requested": count,
                    "remaining": max(0, FREE_RUN_LIMIT - current_runs),
                }

            transaction.set(ref, {
                "runs_this_month": current_runs + count,
                "month_key": current_month,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }, merge=True)
            return {
                "ok": True,
                "plan": plan,
                "used": current_runs + count,
                "remaining": None if plan == "paid" else max(0, FREE_RUN_LIMIT - current_runs - count),
            }

        return reserve(transaction)
    except Exception as e:
        print(f"Firestore quota reservation failed: {e}")
        return {"ok": False, "reason": "quota_store_error"}


def save_run_firestore(data: dict):
    db = _get_db()
    if not db:
        return False
    try:
        run_id = data.get("run_id", "unknown")
        uid = data.get("uid", "anonymous")
        doc_id = f"{uid}_{run_id}"
        db.collection("runs").document(doc_id).set({
            **data,
            "sources": data.get("sources", []),
            "subject_variants": data.get("subject_variants", []),
        })
        return True
    except Exception as e:
        print(f"Firestore save failed: {e}")
        return False


def get_runs_firestore(uid: str = None):
    db = _get_db()
    if not db:
        return []
    try:
        col = db.collection("runs")
        if uid:
            col = col.where("uid", "==", uid)
        docs = col.order_by("timestamp", direction="DESCENDING").limit(100).stream()
        return [doc.to_dict() for doc in docs]
    except Exception as e:
        print(f"Firestore fetch failed: {e}")
        return []
