"""
Tests for Pydantic Settings blank environment variable handling,
SESSION_COOKIE_SECURE development vs. production behavior,
and Docker Compose / GitHub Actions smoke-test configuration integrity.
"""

from pathlib import Path
from fastapi.testclient import TestClient
import pytest
from pydantic import ValidationError

from app.core.config import Settings, settings
from app.main import app

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_blank_session_cookie_secure_does_not_crash_and_uses_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    Reproduces the exact CI failure:
      pydantic_core.ValidationError: SESSION_COOKIE_SECURE
      Input should be a valid boolean, unable to interpret input (input_value='', input_type=str)
    Verifies that empty or whitespace-only strings fall back cleanly to the default.
    """
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "")

    cfg = Settings(_env_file=None)
    assert cfg.SESSION_COOKIE_SECURE is False
    assert cfg.cookie_secure_flag is False

    monkeypatch.setenv("SESSION_COOKIE_SECURE", "   ")
    cfg_ws = Settings(_env_file=None)
    assert cfg_ws.SESSION_COOKIE_SECURE is False
    assert cfg_ws.cookie_secure_flag is False


def test_all_boolean_and_numeric_env_vars_survive_empty_strings(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    Ensures every boolean and numeric setting in Settings safely ignores empty strings
    and falls back to its explicit default value.
    """
    empty_vars = {
        "DEBUG": "",
        "SESSION_COOKIE_SECURE": "",
        "ENABLE_LOCAL_AI_ASSISTANT": "",
        "ENABLE_EXTERNAL_BARCODE_LOOKUP": "",
        "ENABLE_FOODDATA_CENTRAL": "",
        "ENABLE_USDA_FDC_LOOKUP": "",
        "ENABLE_OCR": "",
        "ENABLE_EXPERIMENTAL_DISH_RECOGNITION": "",
        "ENABLE_EXTERNAL_WEB_SEARCH": "",
        "ENABLE_ONLINE_RECIPE_SEARCH": "",
        "ENABLE_PRODUCT_CACHE": "",
        "SESSION_EXPIRE_HOURS": "",
        "SESSION_REMEMBER_ME_DAYS": "",
        "OLLAMA_TIMEOUT_SECONDS": "",
        "MAX_UPLOAD_SIZE_BYTES": "",
    }
    for k, v in empty_vars.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setenv("APP_ENV", "development")

    cfg = Settings(_env_file=None)
    assert cfg.DEBUG is False
    assert cfg.SESSION_COOKIE_SECURE is False
    assert cfg.ENABLE_LOCAL_AI_ASSISTANT is True
    assert cfg.ENABLE_EXTERNAL_BARCODE_LOOKUP is True
    assert cfg.ENABLE_FOODDATA_CENTRAL is True
    assert cfg.ENABLE_USDA_FDC_LOOKUP is True
    assert cfg.ENABLE_OCR is True
    assert cfg.ENABLE_EXPERIMENTAL_DISH_RECOGNITION is True
    assert cfg.ENABLE_EXTERNAL_WEB_SEARCH is False
    assert cfg.ENABLE_ONLINE_RECIPE_SEARCH is True
    assert cfg.ENABLE_PRODUCT_CACHE is True
    assert cfg.SESSION_EXPIRE_HOURS == 24
    assert cfg.SESSION_REMEMBER_ME_DAYS == 30
    assert cfg.OLLAMA_TIMEOUT_SECONDS == 120.0


def test_production_enforces_secure_cookies_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    Verifies that production mode (APP_ENV=production) enables SESSION_COOKIE_SECURE=True
    and cookie_secure_flag=True even when SESSION_COOKIE_SECURE is unset or empty,
    and also when SESSION_COOKIE_SECURE=true is explicitly configured.
    """
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "")

    cfg_prod_blank = Settings(_env_file=None)
    assert cfg_prod_blank.SESSION_COOKIE_SECURE is True
    assert cfg_prod_blank.cookie_secure_flag is True

    monkeypatch.setenv("SESSION_COOKIE_SECURE", "true")
    cfg_prod_explicit = Settings(_env_file=None)
    assert cfg_prod_explicit.SESSION_COOKIE_SECURE is True
    assert cfg_prod_explicit.cookie_secure_flag is True


def test_ci_http_smoke_test_explicit_false_setting(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    Verifies the CI Docker Compose smoke test setting (SESSION_COOKIE_SECURE="false")
    over local HTTP.
    """
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "false")

    cfg = Settings(_env_file=None)
    assert cfg.SESSION_COOKIE_SECURE is False
    assert cfg.cookie_secure_flag is False


def test_invalid_non_empty_boolean_still_raises_validation_error(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    Ensures genuinely invalid non-empty boolean strings still raise ValidationError.
    """
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "not-a-valid-boolean")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_env_example_and_compose_files_have_valid_cookie_and_ci_settings() -> None:
    """
    Verifies .env.example, docker-compose.yml, docker-compose.prod.yml,
    docker-compose.release.yml, and .github/workflows/ci.yml.
    """
    env_example_path = REPO_ROOT / ".env.example"
    cfg_from_example = Settings(_env_file=str(env_example_path))
    assert cfg_from_example.SESSION_COOKIE_SECURE is False

    dc_local = (REPO_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    assert "SESSION_COOKIE_SECURE=${SESSION_COOKIE_SECURE:-false}" in dc_local

    dc_prod = (REPO_ROOT / "docker-compose.prod.yml").read_text(encoding="utf-8")
    assert "APP_ENV=${APP_ENV:-production}" in dc_prod
    assert "SESSION_COOKIE_SECURE=${SESSION_COOKIE_SECURE:-true}" in dc_prod

    dc_release = (REPO_ROOT / "docker-compose.release.yml").read_text(encoding="utf-8")
    assert "APP_ENV=${APP_ENV:-production}" in dc_release
    assert "SESSION_COOKIE_SECURE=${SESSION_COOKIE_SECURE:-true}" in dc_release

    ci_yml = (REPO_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    assert 'SESSION_COOKIE_SECURE: "false"' in ci_yml
    assert "docker-compose-smoke-test" in ci_yml
    assert "publish-dockerhub:" in ci_yml


def test_full_stack_smoke_workflow_and_frontend_to_backend_cors(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    Executes the full Docker Compose smoke-test sequence against the live FastAPI ASGI lifespan:
    1. Healthcheck (/api/v1/health) with Origin: http://localhost:8080 CORS verification.
    2. Unauthenticated 401 checks on /api/v1/foods/categories and /api/v1/foods?q=Ragi.
    3. Registration over plain HTTP (base_url="http://localhost:8000") with SESSION_COOKIE_SECURE=False,
       confirming cookies are persisted and sent on subsequent HTTP requests from Origin: http://localhost:8080.
    4. Verification that production mode (SESSION_COOKIE_SECURE=True) emits the '; Secure' cookie attribute.
    """
    monkeypatch.setattr(settings, "APP_ENV", "development")
    monkeypatch.setattr(settings, "SESSION_COOKIE_SECURE", False)

    with TestClient(app, base_url="http://localhost:8000") as client:
        # 1. Health & CORS from Frontend Origin (http://localhost:8080)
        health_res = client.get("/api/v1/health", headers={"Origin": "http://localhost:8080"})
        assert health_res.status_code == 200
        assert health_res.headers.get("access-control-allow-origin") == "http://localhost:8080"
        assert health_res.headers.get("access-control-allow-credentials") == "true"
        health_data = health_res.json()
        assert health_data["status"] == "healthy"
        assert health_data["counts"]["foods"] >= 50
        assert health_data["counts"]["conditions"] >= 18

        # 2. Unauthenticated requests rejected with 401
        assert client.get("/api/v1/foods/categories").status_code == 401
        assert client.get("/api/v1/foods?q=Ragi").status_code == 401

        # 3. Register over HTTP with Origin: http://localhost:8080 and verify non-Secure cookie works on HTTP
        reg_res = client.post(
            "/api/v1/auth/register",
            headers={"Origin": "http://localhost:8080"},
            json={
                "name": "CI Smoke Tester",
                "email": "ci_smoke_tester@gharplate.local",
                "password": "SmokePassword123!",
                "password_confirmation": "SmokePassword123!",
                "remember_me": False,
            },
        )
        assert reg_res.status_code == 201
        set_cookie_headers = reg_res.headers.get_list("set-cookie")
        assert any("gharplate_session=" in sc and "Secure" not in sc for sc in set_cookie_headers)

        # Authenticated frontend-to-backend calls over HTTP succeed with HTTP 200
        cat_res = client.get("/api/v1/foods/categories", headers={"Origin": "http://localhost:8080"})
        assert cat_res.status_code == 200
        assert len(cat_res.json()) >= 5

        foods_res = client.get("/api/v1/foods?q=Ragi", headers={"Origin": "http://localhost:8080"})
        assert foods_res.status_code == 200
        assert foods_res.json()["total"] >= 1

        # 4. Verify production HTTPS mode sets Secure attribute on cookies
        monkeypatch.setattr(settings, "APP_ENV", "production")
        monkeypatch.setattr(settings, "SESSION_COOKIE_SECURE", True)
        login_prod_res = client.post(
            "/api/v1/auth/login",
            json={
                "email": "ci_smoke_tester@gharplate.local",
                "password": "SmokePassword123!",
                "remember_me": False,
            },
        )
        assert login_prod_res.status_code == 200
        prod_cookies = login_prod_res.headers.get_list("set-cookie")
        assert any("gharplate_session=" in sc and "Secure" in sc for sc in prod_cookies)
