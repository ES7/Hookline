import os
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import auth, credentials

load_dotenv("c:\\Users\\sayed\\Desktop\\Hookline\\backend\\.env")
project_id = os.getenv("FIREBASE_PROJECT_ID")

print("Project ID:", project_id)

try:
    firebase_admin.initialize_app(options={"projectId": project_id})
    print("Initialized app.")
except Exception as e:
    print("Init error:", e)

# We can't generate a token easily from the backend without a service account or custom token.
# But we can try to verify a fake token and see the EXACT exception type!
try:
    import jwt
    # A random fake JWT won't work for decode because it needs the 3 segments (header.payload.signature)
    # But let's just make a mock JWT to test the import and decode.
    import base64
    header = base64.urlsafe_b64encode(b'{"alg":"none"}').decode()
    payload = base64.urlsafe_b64encode(b'{"uid":"test1234"}').decode()
    fake_jwt = f"{header}.{payload}."
    claims = jwt.decode(fake_jwt, options={"verify_signature": False})
    print("Decoded fake JWT:", claims)
except Exception as e:
    print("JWT Decode error:", e)
