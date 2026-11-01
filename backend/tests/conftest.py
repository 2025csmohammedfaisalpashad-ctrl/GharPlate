import os
import tempfile
from pathlib import Path
from typing import Any
import uuid
import pytest
from fastapi.testclient import TestClient

# Force an isolated temporary SQLite database BEFORE importing any application modules
# so automated tests never touch or mutate production databases (backend/gharplate.db or gharplate.db).
_TEST_DB_DIR = tempfile.mkdtemp(prefix="gharplate_pytest_db_")
_TEST_DB_PATH = Path(_TEST_DB_DIR) / "test_gharplate.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_PATH}"

from app.core.config import settings  # noqa: E402
from app.db.session import Base, SessionLocal, engine  # noqa: E402
from app.db.init_db import seed_database  # noqa: E402


class AuthenticatedTestClient(TestClient):
    """
    TestClient that registers/authenticates a real database-backed user account
    and automatically attaches the session's X-CSRF-Token header on state-changing requests,
    matching the browser fetch wrapper behavior.
    """

    def __init__(
        self,
        app: Any,
        *,
        user_email: str | None = None,
        user_name: str = "GharPlate Automated Test User",
        user_password: str = "GharPlateTestPass#2026",
        auto_authenticate: bool = True,
        **kwargs: Any,
    ) -> None:
        super().__init__(app, **kwargs)
        self._default_email = user_email or f"pytest_{uuid.uuid4().hex[:10]}@gharplate.in"
        self._default_name = user_name
        self._default_password = user_password
        self._auto_authenticate = auto_authenticate
        self.csrf_token: str | None = None
        self.household_token: str = "me"
        self.user_id: int | None = None

    def ensure_authenticated(self) -> None:
        if not self._auto_authenticate or self.csrf_token is not None:
            return
        resp = super().request(
            "POST",
            "/api/v1/auth/register",
            json={
                "name": self._default_name,
                "email": self._default_email,
                "password": self._default_password,
                "password_confirmation": self._default_password,
                "remember_me": True,
            },
        )
        if resp.status_code == 409:
            resp = super().request(
                "POST",
                "/api/v1/auth/login",
                json={
                    "email": self._default_email,
                    "password": self._default_password,
                    "remember_me": True,
                },
            )
        if resp.status_code in (200, 201):
            payload = resp.json()
            self.csrf_token = payload.get("csrf_token") or self.cookies.get(settings.CSRF_COOKIE_NAME)
            hh = payload.get("household") or {}
            self.household_token = hh.get("household_token") or "me"
            user = payload.get("user") or {}
            self.user_id = user.get("id")

    def request(self, method: str, url: str, **kwargs: Any):  # type: ignore[override]
        if self._auto_authenticate and not str(url).startswith("/api/v1/auth/"):
            self.ensure_authenticated()

        upper_method = method.upper()
        if upper_method in ("POST", "PUT", "PATCH", "DELETE"):
            headers = dict(kwargs.get("headers") or {})
            has_csrf = any(k.lower() == "x-csrf-token" for k in headers)
            csrf_val = self.cookies.get(settings.CSRF_COOKIE_NAME) or self.csrf_token
            if not has_csrf and csrf_val:
                headers["X-CSRF-Token"] = csrf_val
                kwargs["headers"] = headers

        return super().request(method, url, **kwargs)


@pytest.fixture(scope="session", autouse=True)
def initialize_isolated_test_database():
    """Create schema and seed the isolated temporary test database once per test session."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_database(db, write_report=False)
    finally:
        db.close()
    yield
    if _TEST_DB_PATH.exists():
        try:
            _TEST_DB_PATH.unlink()
        except OSError:
            pass
