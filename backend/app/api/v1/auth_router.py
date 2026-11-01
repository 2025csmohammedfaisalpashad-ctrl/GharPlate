"""
Database-Backed Authentication Router for GharPlate (`/api/v1/auth`).
Implements:
- POST /api/v1/auth/register
- POST /api/v1/auth/login
- GET  /api/v1/auth/me
- POST /api/v1/auth/logout
"""

from datetime import datetime, UTC
import re
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    clear_auth_cookies,
    create_server_session,
    ensure_user_owned_household,
    get_current_session,
    hash_opaque_token,
    hash_password,
    normalize_email,
    set_auth_cookies,
    verify_password,
)
from app.db.session import get_db
from app.models.entities import Household, UserAccount, UserSession
from app.schemas.api_schemas import (
    AuthLoginRequest,
    AuthRegisterRequest,
    AuthSessionResponse,
    AuthUserOut,
    HouseholdMemberOut,
    HouseholdOut,
)

auth_router = APIRouter(prefix="/auth", tags=["Authentication"])

DbSession = Annotated[Session, Depends(get_db)]

EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

AUTHENTICATED_PRIVACY_NOTICE = (
    "Authenticated Household Workspace: Your household profile, family members, recipes, and AI assistant conversations "
    "are strictly private to your authenticated account. Uploaded food or label images are processed in memory and never stored without explicit consent."
)


def _serialize_household(hh: Household) -> HouseholdOut:
    return HouseholdOut(
        id=hh.id,
        household_token=hh.household_token,
        name=hh.name,
        default_member_id=hh.default_member_id,
        privacy_notice=AUTHENTICATED_PRIVACY_NOTICE,
        created_at=hh.created_at,
        members=[HouseholdMemberOut.model_validate(m) for m in (hh.members or [])],
    )


@auth_router.post(
    "/register",
    response_model=AuthSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_account(
    req: AuthRegisterRequest,
    request: Request,
    response: Response,
    db: DbSession,
):
    cleaned_name = req.name.strip()
    if len(cleaned_name) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Name must be at least 2 characters long.",
        )

    cleaned_email = normalize_email(req.email)
    if not EMAIL_PATTERN.match(cleaned_email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid email address.",
        )

    if len(req.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long.",
        )

    if req.password != req.password_confirmation:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password and password confirmation do not match.",
        )

    existing_user = (
        db.query(UserAccount).filter(UserAccount.email == cleaned_email).first()
    )
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address is already registered. Please sign in instead.",
        )

    user = UserAccount(
        email=cleaned_email,
        full_name=cleaned_name,
        password_hash=hash_password(req.password),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Create a dedicated, private household for this user account
    household = ensure_user_owned_household(
        db, user, default_name=f"{cleaned_name}'s Household"
    )

    # Establish a verified server-side session and set HttpOnly + CSRF cookies
    session_obj, raw_session_token, raw_csrf_token = create_server_session(
        db=db,
        user=user,
        remember_me=req.remember_me,
        request=request,
    )
    set_auth_cookies(
        response=response,
        raw_session_token=raw_session_token,
        raw_csrf_token=raw_csrf_token,
        remember_me=req.remember_me,
    )

    return AuthSessionResponse(
        authenticated=True,
        user=AuthUserOut.model_validate(user),
        household=_serialize_household(household),
        csrf_token=raw_csrf_token,
        session_expires_at=session_obj.expires_at,
        message=f"Account created for {user.full_name}.",
    )


@auth_router.post("/login", response_model=AuthSessionResponse)
def login_account(
    req: AuthLoginRequest,
    request: Request,
    response: Response,
    db: DbSession,
):
    cleaned_email = normalize_email(req.email)
    user = db.query(UserAccount).filter(UserAccount.email == cleaned_email).first()

    if user is None or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email address or password.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )

    # Revoke any previous session cookie sent by this browser before issuing a rotated session
    old_cookie = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if old_cookie:
        old_hash = hash_opaque_token(old_cookie)
        old_session = (
            db.query(UserSession)
            .filter(UserSession.session_token_hash == old_hash)
            .first()
        )
        if old_session and old_session.revoked_at is None:
            old_session.revoked_at = datetime.now(UTC)
            db.commit()

    household = ensure_user_owned_household(db, user)
    session_obj, raw_session_token, raw_csrf_token = create_server_session(
        db=db,
        user=user,
        remember_me=req.remember_me,
        request=request,
    )
    set_auth_cookies(
        response=response,
        raw_session_token=raw_session_token,
        raw_csrf_token=raw_csrf_token,
        remember_me=req.remember_me,
    )

    return AuthSessionResponse(
        authenticated=True,
        user=AuthUserOut.model_validate(user),
        household=_serialize_household(household),
        csrf_token=raw_csrf_token,
        session_expires_at=session_obj.expires_at,
        message=f"Welcome back, {user.full_name}.",
    )


@auth_router.get("/me", response_model=AuthSessionResponse)
def get_authenticated_me(
    request: Request,
    response: Response,
    session_obj: Annotated[UserSession, Depends(get_current_session)],
    db: DbSession,
):
    user = session_obj.user
    household = ensure_user_owned_household(db, user)

    # Rotate or preserve CSRF cookie so SPA reload always has a valid CSRF token
    csrf_cookie = request.cookies.get(settings.CSRF_COOKIE_NAME)
    if csrf_cookie and secrets.compare_digest(
        hash_opaque_token(csrf_cookie), session_obj.csrf_token_hash
    ):
        raw_csrf_token = csrf_cookie
    else:
        raw_csrf_token = secrets.token_urlsafe(32)
        session_obj.csrf_token_hash = hash_opaque_token(raw_csrf_token)
        db.commit()
        samesite_val = settings.SESSION_COOKIE_SAMESITE.lower()
        if samesite_val not in ("lax", "strict", "none"):
            samesite_val = "lax"
        response.set_cookie(
            key=settings.CSRF_COOKIE_NAME,
            value=raw_csrf_token,
            httponly=False,
            secure=settings.cookie_secure_flag,
            samesite=samesite_val,  # type: ignore[arg-type]
            path="/",
        )

    return AuthSessionResponse(
        authenticated=True,
        user=AuthUserOut.model_validate(user),
        household=_serialize_household(household),
        csrf_token=raw_csrf_token,
        session_expires_at=session_obj.expires_at,
        message="Active authenticated session.",
    )


@auth_router.post("/logout")
def logout_account(
    response: Response,
    session_obj: Annotated[UserSession, Depends(get_current_session)],
    db: DbSession,
):
    session_obj.revoked_at = datetime.now(UTC)
    db.commit()
    clear_auth_cookies(response)
    return {
        "authenticated": False,
        "logged_out": True,
        "message": "Your session has been invalidated.",
    }
