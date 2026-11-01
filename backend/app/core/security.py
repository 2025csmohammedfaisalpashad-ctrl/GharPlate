"""
Argon2id Password Hashing, Cryptographic Session Management, HttpOnly Cookies,
CSRF Verification, and Household Ownership Enforcement for GharPlate.
"""

from datetime import datetime, timedelta, UTC
import hashlib
import secrets
from typing import Annotated
import uuid

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.db.session import get_db
from app.models.entities import Household, UserAccount, UserSession

_password_hasher = PasswordHasher(
    time_cost=2,
    memory_cost=65536,
    parallelism=2,
    hash_len=32,
    salt_len=16,
)

DbSession = Annotated[Session, Depends(get_db)]


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def hash_password(plain_password: str) -> str:
    """Hashes a password using Argon2id."""
    return _password_hasher.hash(plain_password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verifies a plaintext password against a stored Argon2id hash in constant time."""
    if not plain_password or not password_hash:
        return False
    try:
        return bool(_password_hasher.verify(password_hash, plain_password))
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def hash_opaque_token(raw_token: str) -> str:
    """Computes SHA-256 hex digest of an opaque session or CSRF token before DB storage."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def create_server_session(
    db: Session,
    user: UserAccount,
    remember_me: bool,
    request: Request | None = None,
) -> tuple[UserSession, str, str]:
    """
    Creates a new server-validated session in the database.
    Returns (session_record, raw_session_token, raw_csrf_token).
    """
    raw_session_token = secrets.token_urlsafe(32)
    raw_csrf_token = secrets.token_urlsafe(32)

    now = datetime.now(UTC)
    if remember_me:
        expires_at = now + timedelta(days=settings.SESSION_REMEMBER_ME_DAYS)
    else:
        expires_at = now + timedelta(hours=settings.SESSION_EXPIRE_HOURS)

    ip_addr = None
    user_agent = None
    if request is not None:
        if request.client:
            ip_addr = request.client.host
        ua = request.headers.get("user-agent")
        if ua:
            user_agent = ua[:300]

    session_obj = UserSession(
        user_id=user.id,
        session_token_hash=hash_opaque_token(raw_session_token),
        csrf_token_hash=hash_opaque_token(raw_csrf_token),
        remember_me=bool(remember_me),
        ip_address=ip_addr,
        user_agent=user_agent,
        created_at=now,
        last_seen_at=now,
        expires_at=expires_at,
        revoked_at=None,
    )
    db.add(session_obj)
    db.commit()
    db.refresh(session_obj)
    return session_obj, raw_session_token, raw_csrf_token


def set_auth_cookies(
    response: Response,
    raw_session_token: str,
    raw_csrf_token: str,
    remember_me: bool,
) -> None:
    """Sets the HttpOnly session cookie and companion CSRF cookie on the HTTP response."""
    max_age: int | None = None
    if remember_me:
        max_age = settings.SESSION_REMEMBER_ME_DAYS * 86400
    else:
        max_age = settings.SESSION_EXPIRE_HOURS * 3600

    samesite_val = settings.SESSION_COOKIE_SAMESITE.lower()
    if samesite_val not in ("lax", "strict", "none"):
        samesite_val = "lax"

    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=raw_session_token,
        max_age=max_age,
        httponly=True,
        secure=settings.cookie_secure_flag,
        samesite=samesite_val,  # type: ignore[arg-type]
        path="/",
    )
    response.set_cookie(
        key=settings.CSRF_COOKIE_NAME,
        value=raw_csrf_token,
        max_age=max_age,
        httponly=False,
        secure=settings.cookie_secure_flag,
        samesite=samesite_val,  # type: ignore[arg-type]
        path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    """Clears the HttpOnly session cookie and CSRF cookie."""
    response.delete_cookie(key=settings.SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(key=settings.CSRF_COOKIE_NAME, path="/")


def _extract_raw_session_token(request: Request) -> str | None:
    cookie_token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if cookie_token and cookie_token.strip():
        return cookie_token.strip()
    return None


def get_current_session(
    request: Request,
    db: DbSession,
) -> UserSession:
    """
    Validates the server-side session from the HttpOnly cookie and enforces CSRF protection
    on all state-changing HTTP methods (POST, PUT, PATCH, DELETE).
    """
    raw_token = _extract_raw_session_token(request)
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in to access your GharPlate account.",
        )

    token_hash = hash_opaque_token(raw_token)
    session_obj = (
        db.query(UserSession)
        .options(joinedload(UserSession.user))
        .filter(UserSession.session_token_hash == token_hash)
        .first()
    )
    if not session_obj or session_obj.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or logged-out session. Please sign in again.",
        )

    now = datetime.now(UTC)
    expires_at = session_obj.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)

    if expires_at <= now:
        session_obj.revoked_at = now
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please sign in again.",
        )

    if not session_obj.user or not session_obj.user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is inactive or unavailable.",
        )

    # Enforce CSRF verification on state-changing requests
    if request.method.upper() in ("POST", "PUT", "PATCH", "DELETE"):
        header_csrf = (request.headers.get("X-CSRF-Token") or "").strip()
        if not header_csrf:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF token missing (X-CSRF-Token header required).",
            )
        provided_csrf_hash = hash_opaque_token(header_csrf)
        if not secrets.compare_digest(provided_csrf_hash, session_obj.csrf_token_hash):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid CSRF token.",
            )

    session_obj.last_seen_at = now
    db.commit()
    return session_obj


def get_current_user(
    session_obj: Annotated[UserSession, Depends(get_current_session)],
) -> UserAccount:
    """Returns the authenticated UserAccount from the validated server-side session."""
    return session_obj.user


def ensure_user_owned_household(
    db: Session,
    user: UserAccount,
    default_name: str | None = None,
) -> Household:
    """
    Retrieves the Household owned by the authenticated user, or creates a dedicated
    new Household for this user if none exists yet.
    Never attaches or exposes another user's household or an unowned legacy household.
    """
    hh = (
        db.query(Household)
        .options(joinedload(Household.members))
        .filter(Household.owner_user_id == user.id)
        .order_by(Household.id.asc())
        .first()
    )
    if hh:
        return hh

    household_title = default_name or f"{user.full_name}'s Household"
    hh = Household(
        owner_user_id=user.id,
        household_token=f"hh_{uuid.uuid4().hex}",
        name=household_title[:120],
        privacy_notice_accepted=True,
    )
    db.add(hh)
    db.commit()
    db.refresh(hh)
    return hh


def verify_household_ownership(
    db: Session,
    user: UserAccount,
    requested_token: str | None = None,
) -> Household:
    """
    Verifies that the requested household belongs to the authenticated user.
    If a token belonging to another user or an unowned household is supplied,
    raises 403 Forbidden so User B can never access User A's household by token or ID.
    """
    owned_hh = ensure_user_owned_household(db, user)
    if requested_token and requested_token != "me" and requested_token != owned_hh.household_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You do not have permission to access another account's household.",
        )
    return owned_hh
