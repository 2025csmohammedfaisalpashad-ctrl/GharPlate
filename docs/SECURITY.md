# GharPlate Security Architecture (`docs/SECURITY.md`)

## 1. Input & Upload Validation

- **Pydantic v2 Schema Validation**: Every request body and query parameter is validated through strict Pydantic v2 models (`backend/app/schemas/api_schemas.py`) enforcing numeric bounds (e.g., `gt=0` on quantities and servings, `min_length=2, max_length=4` on product comparisons).
- **Image Upload Restrictions**:
  - Allowed MIME types are restricted to `image/jpeg`, `image/png`, and `image/webp` (`ALLOWED_IMAGE_MIMES`).
  - Maximum upload size is enforced at 5 MB (`MAX_UPLOAD_SIZE_BYTES = 5242880`).
  - Uploaded streams are verified via `PIL.Image.open(buf).verify()` in memory before processing; invalid or executable payloads (e.g., `.exe` or malformed streams) are rejected with HTTP `400 Bad Request`.

## 2. Database & Injection Protection

- **Parameterised ORM Operations**: All database reads and writes use SQLAlchemy 2.0 ORM queries with bound parameters (`backend/app/models/entities.py`), preventing SQL injection across multilingual search and barcode lookups.
- **Foreign Key Integrity**: SQLite `PRAGMA foreign_keys=ON` is enforced on every database connection.

## 3. Safe Error Handling & Secrets Management

- **Global Exception Shield**: `backend/app/main.py` registers a global exception handler that prevents internal stack traces or filesystem paths from leaking to clients on unexpected `500` errors.
- **CORS Policy**: Configured via `CORS_ORIGINS` environment variable (`app/core/config.py`).
- **Zero Hardcoded Secrets**: All configuration resides in environment variables documented in `.env.example`. Docker Hub credentials in CI/CD use GitHub Secrets (`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`).
