import os
import tempfile
from pathlib import Path
import pytest

# Force an isolated temporary SQLite database BEFORE importing any application modules
# so automated tests never touch or mutate production databases (backend/gharplate.db or gharplate.db).
_TEST_DB_DIR = tempfile.mkdtemp(prefix="gharplate_pytest_db_")
_TEST_DB_PATH = Path(_TEST_DB_DIR) / "test_gharplate.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_PATH}"

from app.db.session import Base, SessionLocal, engine  # noqa: E402
from app.db.init_db import seed_database  # noqa: E402


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
