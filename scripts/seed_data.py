#!/usr/bin/env python3
"""
Standalone CLI script to initialize the GharPlate database schema,
ingest verified food composition and clinical guidance records,
and generate `data/import_reports/latest_import_report.json`.
"""
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.db.session import Base, SessionLocal, engine  # noqa: E402
from app.db.init_db import seed_database  # noqa: E402


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        report = seed_database(db, write_report=True)
        print("GharPlate Data Ingestion Complete:")
        print(json.dumps(report, indent=2))
    finally:
        db.close()


if __name__ == "__main__":
    main()
