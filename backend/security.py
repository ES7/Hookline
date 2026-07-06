import os
from dataclasses import dataclass

from fastapi import HTTPException, Request, status

from firestore_db import ensure_user_firestore, reserve_user_runs, verify_id_token


@dataclass(frozen=True)
class AuthenticatedUser:
    uid: str
    email: str | None = None
    name: str | None = None
    picture: str | None = None
    is_local_dev: bool = False


def _local_dev_auth_enabled() -> bool:
    return os.getenv("AUTH_DISABLED_FOR_LOCAL_DEV", "").lower() in {"1", "true", "yes"}


async def require_user(request: Request) -> AuthenticatedUser:
    if _local_dev_auth_enabled():
        return AuthenticatedUser(uid="local-dev", email="local-dev@hookline.test", is_local_dev=True)

    auth_header = request.headers.get("authorization", "")
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in again before running outreach.",
        )

    claims = verify_id_token(token)
    if not claims or not claims.get("uid"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token.",
        )

    user = AuthenticatedUser(
        uid=claims["uid"],
        email=claims.get("email"),
        name=claims.get("name"),
        picture=claims.get("picture"),
    )

    if not ensure_user_firestore(user.__dict__):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server auth store is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON.",
        )
    return user


def reserve_quota_or_raise(user: AuthenticatedUser, count: int):
    if user.is_local_dev:
        return {"ok": True, "plan": "local-dev", "used": 0, "remaining": None}

    result = reserve_user_runs(user.uid, count)
    if result.get("ok"):
        return result

    if result.get("reason") == "quota_exceeded":
        raise HTTPException(status_code=402, detail={
            "message": "Monthly free run limit reached.",
            "remaining": result.get("remaining", 0),
            "requested": result.get("requested", count),
            "limit": result.get("limit"),
        })

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Server quota store is not available. Set FIREBASE_SERVICE_ACCOUNT_JSON.",
    )
